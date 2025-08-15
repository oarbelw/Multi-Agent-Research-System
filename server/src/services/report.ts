// server/src/services/report.ts
import Memory from "../db/models/Memory.js";
import Report from "../db/models/Report.js";
import Conversation from "../db/models/Conversation.js";
import { withFallback } from "./llm/index.js";
import { getGraphSnapshot } from "./entities.js"; 

type GenInput = {
  conversationId: string;
  title?: string;
  format?: "executive" | "standard" | "comprehensive";
  style?: "concise" | "narrative" | "technical";
  detailLevel?: "brief" | "balanced" | "in-depth";
};

type LLMProvider = "openai" | "anthropic" | "gemini" | "mock";
type Pack = { provider: LLMProvider; model: string };

const outlinePrompt = (
  topic: string | undefined,
  format: string | undefined,
  detailLevel: string | undefined,
  style: string | undefined,
  mems: any[],
  graph: any
) => `You are the Author agent specialized in report generation.
Create a JSON object like:
{ "sections": [ { "key":"exec_summary","title":"…" }, ... ] }
(Use keys: exec_summary, key_findings, detailed_analysis, entity_graph, open_questions, recommendations)
Topic: ${topic ?? "(unspecified)"}
Format: ${format}, Detail: ${detailLevel}, Style: ${style}
Memories: ${JSON.stringify(mems.slice(0,80))}
Graph: ${JSON.stringify(graph).slice(0,2000)}`;

const sectionPrompt = (
  topic: string | undefined,
  section: { key: string; title: string },
  mems: any[],
  graph: any,
  style: string | undefined
) => `Write the "${section.title}" section in Markdown.
Stay focused on "${topic ?? "(unspecified)"}".
Use memories and graph below. Be structured and helpful.
Return ONLY the Markdown body (no code fences).
Memories: ${JSON.stringify(mems.slice(0,120))}
Graph: ${JSON.stringify(graph).slice(0,2000)}
Style: ${style}`;

const pickMaxTokens = (d: GenInput["detailLevel"]) =>
  d === "in-depth" ? 1600 : d === "balanced" ? 1100 : 700;

const pickPackForSection = (key: string, packs: { summary: Pack; narrative: Pack; tech: Pack }): Pack => {
  if (key === "exec_summary") return packs.summary;
  if (key === "entity_graph") return packs.tech;
  return packs.narrative;
};

function coerceObjectJSON<T = any>(text: string, fallback: T): T {
  if (!text || typeof text !== "string") return fallback;
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object") return j as T;
  } catch {}
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) {
    try { return JSON.parse(obj[0]) as T; } catch {}
  }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      const a = JSON.parse(arr[0]);
      if (Array.isArray(a)) return { sections: a } as unknown as T;
    } catch {}
  }
  return fallback;
}


export async function generateReport(input: GenInput) {
  const convo = await Conversation.findById(input.conversationId);
  if (!convo) throw new Error("Conversation not found");

  const topic = (convo as any).topic || input.title || "Research Report";
  const mems = await Memory.find({ conversationId: input.conversationId })
    .sort({ importance: -1, confidence: -1, timestamp: 1 })
    .limit(1000);
  const graph = await getGraphSnapshot(80);

  const format = input.format ?? "standard";
  const style = input.style ?? "concise";
  const detailLevel = input.detailLevel ?? (format === "executive" ? "brief" : format === "comprehensive" ? "in-depth" : "balanced");

  // model specialists + fallbacks (narrow provider to literal types)
  const summaryPack: Pack   = { provider: "gemini",    model: "gemini-2.0-flash" };
  const narrativePack: Pack = { provider: "openai",    model: "gpt-4o-mini" };
  const techPack: Pack      = { provider: "anthropic", model: "claude-3-5-sonnet-latest" };
  const packs = { summary: summaryPack, narrative: narrativePack, tech: techPack };

  // outline
  const outlineRes = await withFallback(
    [summaryPack, narrativePack, techPack] as any,
    { temperature: 0.2, maxTokens: 700, prompt: outlinePrompt(topic, format, detailLevel, style, mems, graph) }
  );
  const structure = coerceObjectJSON(outlineRes.text, {
    sections: [
      { key: "exec_summary",     title: "Executive Summary" },
      { key: "key_findings",     title: "Key Findings" },
      { key: "detailed_analysis",title: "Detailed Analysis" },
      { key: "entity_graph",     title: "Entity Relationships" },
      { key: "open_questions",   title: "Open Questions" },
      { key: "recommendations",  title: "Recommendations" },
    ]
  });

  // sections
  const sections: Record<string, { title: string; markdown: string }> = {};
  for (const s of structure.sections || []) {
    const chosen = pickPackForSection(s.key, packs);
    const secRes = await withFallback(
      [chosen, summaryPack, narrativePack] as any,
      { temperature: 0.4, maxTokens: pickMaxTokens(detailLevel), prompt: sectionPrompt(topic, s, mems, graph, style) }
    );
    sections[s.key] = { title: s.title, markdown: secRes.text };
  }

  const report = await Report.create({
    title: topic,
    format,
    detailLevel,
    structure,
    content: sections,
    sourceMemoryIds: mems.map(m => m._id),
    versionNumber: 1,
    modelsUsed: [
      { provider: summaryPack.provider,   model: summaryPack.model,   purpose: "outline" },
      { provider: narrativePack.provider, model: narrativePack.model, purpose: "sections" },
      { provider: techPack.provider,      model: techPack.model,      purpose: "entity_graph" },
    ],
  });

  return report;
}
