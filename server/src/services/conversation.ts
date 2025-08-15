// server/src/services/conversation.ts
import Context from "../db/models/Context.js";
import Conversation from "../db/models/Conversation.js";
import Message from "../db/models/Message.js";
import { getEffectiveContext } from "../contexts/inheritance.js";
import { withFallback } from "./llm/index.js";
import { buildPrompt } from "./agents/prompting.js";
import { extractMemoriesForMessage } from "./memory.js";
import { extractEntitiesForMessage } from "./entities.js";

type Phase = "research" | "analysis" | "synthesis" | "report";
type AgentType = "Researcher" | "Analyzer" | "Synthesizer" | "Author";

function agentTypesForPhase(p: Phase): AgentType[] {
  switch (p) {
    case "research":  return ["Researcher"];
    case "analysis":  return ["Analyzer"];
    case "synthesis": return ["Synthesizer", "Analyzer", "Researcher"];
    case "report":    return ["Author"];
    default:          return [];
  }
}

function fallbacksForPhase(p: Phase) {
  // Effective modelConfig still wins (these are *only* fallbacks)
  switch (p) {
    case "research":
      return [{ provider: "gemini",    model: "gemini-2.0-flash"      },
              { provider: "openai",    model: "gpt-4o-mini"           }];
    case "analysis":
      return [{ provider: "anthropic", model: "claude-3-5-sonnet-latest" },
              { provider: "openai",    model: "gpt-4o-mini"           }];
    case "synthesis":
      return [{ provider: "anthropic", model: "claude-3-5-haiku-latest" },
              { provider: "gemini",    model: "gemini-2.0-flash"      }];
    case "report":
      return [{ provider: "anthropic", model: "claude-3-5-sonnet-latest" },
              { provider: "gemini",    model: "gemini-2.0"            }];
    default:
      return [{ provider: "openai",    model: "gpt-4o-mini"           }];
  }
}

export async function sendUserMessage(conversationId: string, content: string) {
  const convo = await Conversation.findById(conversationId);
  if (!convo) throw new Error("Conversation not found");

  const topic: string | undefined = (convo as any).topic || undefined;
  const phase: Phase = ((convo as any).phase as Phase) || "research";

  // 1) store user message
  const userMsg = await Message.create({
    conversationId,
    sender: "user",
    content,
    metadata: {},
    timestamp: new Date(),
  });

  // background memory & entity extraction for user message
  extractMemoriesForMessage(String(userMsg._id)).catch(() => {});
  extractEntitiesForMessage(String(userMsg._id)).catch(() => {});

  // 2) pick agents for current phase
  const allowed = new Set(agentTypesForPhase(phase));
  const participantIds: string[] = (convo.participantIds as any[])?.map(String) ?? [];

  // Load all configured participants, then filter by agentType
  const participants = participantIds.length
    ? await Context.find({ _id: { $in: participantIds } })
    : await Context.find({ level: "Agent" });

  const activeAgents = participants.filter(
    (c: any) => c.level === "Agent" && allowed.has(c.agentType as AgentType)
  );

  const responses: any[] = [];

  for (const ctx of activeAgents) {
    const { effective } = await getEffectiveContext(String(ctx._id));

    // Effective model first, then phase fallbacks
    const mc = effective.modelConfig || {};
    const fallbacks = [
      ...(mc.provider ? [mc] : []),
      ...fallbacksForPhase(phase),
    ];

    const prompt = buildPrompt(
      ctx.agentType as AgentType,
      effective.traits ?? {},
      content,
      effective.properties?.researchTopic ?? topic
    );

    try {
      const res = await withFallback(
        fallbacks as any, // keep TS happy if withFallback uses stricter Provider types
        {
          system: effective.properties?.systemInstruction,
          prompt,
          temperature: mc.temperature ?? 0.2,
          maxTokens: mc.maxTokens ?? 600,
        }
      );

      const agentMsg = await Message.create({
        conversationId,
        sender: "agent",
        senderContextId: ctx._id,
        content: res.text,
        metadata: {
          provider: res.provider,
          model: res.model,
          tokensInput: res.usage?.input,
          tokensOutput: res.usage?.output,
          agentName: ctx.name,
          phase,
        },
        timestamp: new Date(),
      });

      responses.push(agentMsg);

      // auto-extract memories + entities from the agent message too
      extractMemoriesForMessage(String(agentMsg._id)).catch(() => {});
      extractEntitiesForMessage(String(agentMsg._id)).catch(() => {});

    } catch (e: any) {
      await Message.create({
        conversationId,
        sender: "system",
        content: `Model error for agent ${ctx.name}: ${e.message}`,
        metadata: { error: e.message, phase },
        timestamp: new Date(),
      });
    }
  }

  return { userMsg, agentMessages: responses };
}
