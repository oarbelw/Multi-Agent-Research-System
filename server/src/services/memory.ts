import Memory from "../db/models/Memory.js";
import Message from "../db/models/Message.js";
import { withFallback } from "./llm/index.js";

/**
 * Simple clamp and scoring helpers
 */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const importanceFor = (type: string, conf: number) => {
  // bias actions > facts > insights > questions by default
  const base =
    type === "action" ? 0.85 :
    type === "fact" ? 0.75 :
    type === "insight" ? 0.65 :
    0.55; // question
  return clamp01(base * (0.5 + conf / 2));
};

function safeJson<T = any>(text: string): T | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Extract memories (LLM #1), then classify/score them (LLM #2),
 * then store to Mongo. This runs automatically for user + agent messages.
 *
 * No env changes required; we’ll just fall back across your two providers.
 */
export async function extractMemoriesForMessage(messageId: string) {
  const msg = await Message.findById(messageId);
  if (!msg) return [];

  // 1) Extraction model (concise JSON list)
  const extractPrompt =
    `Extract 0-8 concise memories from the text below. ` +
    `Return STRICT JSON array like: ` +
    `[{"content":"...", "type":"fact|insight|question|action"?, "confidence":0..1?}]` +
    `\n\nText:\n${msg.content}`;

  const extractRes = await withFallback(
    [
      { provider: "openai",     model: "gpt-4o-mini" },
      { provider: "anthropic",  model: "claude-3-5-sonnet-latest" },
    ],
    { prompt: extractPrompt, maxTokens: 600, temperature: 0 }
  );

  const extracted = safeJson<any[]>(extractRes.text) || [];
  if (!Array.isArray(extracted) || !extracted.length) return [];

  // Figure out who said this (for "source" field, as you designed)
  const source =
    msg.sender === "agent"
      ? String(msg.senderContextId ?? "agent")
      : "user";

  const stored: any[] = [];

  // 2) For each extracted memory, classify with a second call
  for (const item of extracted) {
    const rawContent = String(item.content || "").trim();
    if (!rawContent) continue;

    // Optional: if extraction already supplied a reasonable type, we’ll still
    // run classification to assign confidence consistently and log model used.
    const classifyPrompt =
      `Classify the following memory as one of: fact, insight, question, action. ` +
      `Return strict JSON: {"type":"fact|insight|question|action", "confidence":0..1}\n\n` +
      `Memory: "${rawContent}"`;

    const classifyRes = await withFallback(
      [
        { provider: "anthropic", model: "claude-3-5-sonnet-latest" },
        { provider: "openai",    model: "gpt-4o-mini" },
      ],
      { prompt: classifyPrompt, maxTokens: 120, temperature: 0 }
    );

    const classified = safeJson<{ type?: string; confidence?: number }>(classifyRes.text) || {};
    const finalType =
      ["fact", "insight", "question", "action"].includes(String(classified.type))
        ? String(classified.type)
        : (["fact","insight","question","action"].includes(String(item.type)) ? String(item.type) : "insight");

    const conf = clamp01(
      typeof classified.confidence === "number"
        ? classified.confidence
        : (typeof item.confidence === "number" ? item.confidence : 0.7)
    );

    const imp =
      typeof item.importance === "number"
        ? clamp01(item.importance)
        : importanceFor(finalType, conf);

    const doc = await Memory.create({
      content: rawContent,
      type: finalType,
      source,                               // "user" or agentId string
      conversationId: msg.conversationId,
      timestamp: msg.timestamp,

      confidence: conf,
      importance: imp,

      extractedBy: `${extractRes.provider}:${extractRes.model}`,
      classifiedBy: `${classifyRes.provider}:${classifyRes.model}`,
    });

    stored.push(doc);
  }

  return stored;
}
