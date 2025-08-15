import neo4j, { Driver, Session } from "neo4j-driver";

let driver: Driver | null = null;
export function getNeo4jDriver() {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
    );
  }
  return driver;
}
export async function closeNeo4j() { if (driver) await driver.close(); }

/** Upsert entities & relations ************************************************/

export async function upsertEntitiesAndRelations(payload: {
  entities: Array<{ name: string; type?: string; confidence?: number }>;
  relations: Array<{ source: string; target: string; type: string; confidence?: number }>;
}) {
  const drv = getNeo4jDriver();
  const s = drv.session();
  try {
    for (const e of payload.entities || []) {
      await s.run(
        `MERGE (n:Entity {name:$name})
         ON CREATE SET n.type = $type, n.confidence = $conf, n.mentions = 1
         ON MATCH  SET n.type = coalesce(n.type,$type), n.confidence = coalesce($conf,n.confidence), n.mentions = coalesce(n.mentions,0) + 1`,
        { name: e.name, type: e.type || "Entity", conf: e.confidence ?? 0.7 }
      );
    }
    for (const r of payload.relations || []) {
      await s.run(
        `MATCH (a:Entity {name:$a}), (b:Entity {name:$b})
         MERGE (a)-[rel:${safeRel(r.type)}]->(b)
         ON CREATE SET rel.confidence = $conf
         ON MATCH  SET rel.confidence = coalesce($conf, rel.confidence)`,
        { a: r.source, b: r.target, conf: r.confidence ?? 0.6 }
      );
    }
  } finally { await s.close(); }
}

function safeRel(s: string) {
  return (s || "RELATED_TO").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

/** Snapshot for UI ************************************************************/

export async function getGraphSnapshot(limit = 50) {
  const d = getNeo4jDriver();
  const s = d.session();
  try {
    const nodes = await s.run(
      `MATCH (n:Entity)
       RETURN n.name AS name, n.type AS type, coalesce(n.confidence,0.6) AS confidence, coalesce(n.mentions,0) AS mentions
       ORDER BY mentions DESC, confidence DESC
       LIMIT $limit`,
      { limit }
    );
    const names = nodes.records.map(r => r.get("name"));

    const rels = await s.run(
      `MATCH (a:Entity)-[r]->(b:Entity)
       WHERE a.name IN $names AND b.name IN $names
       RETURN a.name AS source, type(r) AS type, b.name AS target, coalesce(r.confidence,0.6) AS confidence
       LIMIT 5*$limit`,
      { names, limit }
    );

    return {
      nodes: nodes.records.map(r => ({
        name: r.get("name"),
        type: r.get("type") || "Entity",
        confidence: r.get("confidence"),
        mentions: r.get("mentions")
      })),
      edges: rels.records.map(r => ({
        source: r.get("source"),
        target: r.get("target"),
        type: r.get("type"),
        confidence: r.get("confidence")
      }))
    };
  } finally { await s.close(); }
}
