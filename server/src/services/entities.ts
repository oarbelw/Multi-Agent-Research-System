import Message from "../db/models/Message.js";
import { withFallback } from "./llm/index.js";
import { getNeo4jDriver } from "../db/graph.js";

type ExtractedEntity = { id: string; name: string; type: string; confidence: number };
type ExtractedRel = { a: string; b: string; type: "RELATED_TO"|"PART_OF"|"CONTRADICTS"; weight: number };

function parseArray<T=any>(text:string): T[] {
  try { const j = JSON.parse(text); return Array.isArray(j) ? j : []; } catch {}
  const m = text.match(/\[[\s\S]*\]/); if (!m) return []; try { return JSON.parse(m[0]); } catch { return []; }
}

export async function extractEntitiesForMessage(messageId: string) {
  const msg = await Message.findById(messageId);
  if (!msg) return;

  const prompt = `Extract named entities and relationships from the text.
Return JSON with "entities" and "relationships".
Entity: { "id": stable-short-id, "name": string, "type": "concept|person|org|tech|place|other", "confidence": 0..1 }
Relationship: { "a": entityId, "b": entityId, "type": "RELATED_TO|PART_OF|CONTRADICTS", "weight": 0..1 }
Text:
${msg.content}`;

  const res = await withFallback(
    [{ provider: "gemini", model: "gemini-2.0-flash" }, { provider: "openai", model: "gpt-4o-mini" }],
    { prompt, temperature: 0, maxTokens: 500 }
  );

  const out = (() => { try { return JSON.parse(res.text); } catch { return null; } })();
  const entities: ExtractedEntity[] = Array.isArray(out?.entities) ? out.entities
    : parseArray(res.text).filter((x:any)=>x.entities).flatMap((x:any)=>x.entities || []);
  const rels: ExtractedRel[] = Array.isArray(out?.relationships) ? out.relationships
    : parseArray(res.text).filter((x:any)=>x.relationships).flatMap((x:any)=>x.relationships || []);

  if (!entities.length && !rels.length) return;

  const neo = getNeo4jDriver();
  const session = neo.session();

  // constraints are idempotent; cheap if already exist
  await session.run(`CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE`);

  try {
    // upsert entities; bump mentions; keep max confidence
    for (const e of entities) {
      await session.run(
        `MERGE (n:Entity {id:$id})
         ON CREATE SET n.name=$name, n.type=$type, n.confidence=$confidence, n.mentions=1
         ON MATCH SET  n.name=coalesce(n.name,$name),
                       n.type=coalesce(n.type,$type),
                       n.confidence=CASE WHEN $confidence > n.confidence THEN $confidence ELSE n.confidence END,
                       n.mentions = coalesce(n.mentions,0) + 1`,
        e
      );
    }
    // relationships
    for (const r of rels) {
      await session.run(
        `MATCH (a:Entity {id:$a}), (b:Entity {id:$b})
         MERGE (a)-[rel:${r.type}]->(b)
         ON CREATE SET rel.weight=$weight, rel.updatedAt=timestamp()
         ON MATCH  SET rel.weight=coalesce(rel.weight,0)+$weight, rel.updatedAt=timestamp()`,
        r
      );
    }
  } finally {
    await session.close();
  }
}

export async function getGraphSnapshot(limit=120) {
  const neo = getNeo4jDriver();
  const session = neo.session();
  try {
    const nodesRes = await session.run(
      `MATCH (n:Entity) RETURN n.id as id, n.name as name, n.type as type, n.confidence as confidence, n.mentions as mentions ORDER BY n.mentions DESC LIMIT $limit`,
      { limit }
    );
    const nodeIds = nodesRes.records.map(r => r.get("id"));
    const relRes = await session.run(
      `MATCH (a:Entity)-[r]->(b:Entity)
       WHERE a.id IN $ids AND b.id IN $ids
       RETURN a.id as a, b.id as b, type(r) as type, r.weight as weight LIMIT 2000`,
      { ids: nodeIds }
    );
    return {
      nodes: nodesRes.records.map(r => ({
        id: r.get("id"),
        name: r.get("name"),
        type: r.get("type"),
        confidence: r.get("confidence") ?? 0,
        mentions: r.get("mentions") ?? 0,
      })),
      edges: relRes.records.map(r => ({
        a: r.get("a"),
        b: r.get("b"),
        type: r.get("type"),
        weight: r.get("weight") ?? 0.1,
      }))
    };
  } finally {
    await session.close();
  }
}
