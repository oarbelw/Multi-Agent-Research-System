// --- Types -------------------------------------------------
export type LLMProvider = "openai" | "anthropic" | "gemini";

export type LLMRequest = {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
};

export type LLMResponse = {
  text: string;
  usage?: { input?: number; output?: number };
  model: string;
  provider: LLMProvider | "mock";
};

export interface LLMClient {
  generate(req: LLMRequest): Promise<LLMResponse>;
}

// --- Clients -----------------------------------------------
import { OpenAIClient } from "./openai.js";
import { AnthropicClient } from "./anthropic.js";
import { GeminiClient } from "./gemini.js";

// --- Env + helpers -----------------------------------------
const MOCK = process.env.LLM_MOCK === "1";

const PROVIDER_ENV: Record<LLMProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const DEFAULT_MODEL: Record<LLMProvider, string> = {
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
  gemini: process.env.GEMINI_MODEL || "gemini-2.0-flash",
};

function hasKey(p: LLMProvider): boolean {
  const envVar = PROVIDER_ENV[p];
  return !!process.env[envVar] && process.env[envVar]!.trim().length > 0;
}

function availableProviders(): LLMProvider[] {
  // order of preference for auto-fallback; tweak if you like
  const order: LLMProvider[] = ["gemini", "openai", "anthropic"];
  return order.filter(hasKey);
}

// --- Factory -----------------------------------------------
export function makeClient(provider: LLMProvider, model: string): LLMClient {
  // no eager key checks here; withFallback will handle that
  switch (provider) {
    case "openai":     return new OpenAIClient(model);
    case "anthropic":  return new AnthropicClient(model);
    case "gemini":     return new GeminiClient(model);
    default:           // exhaustive
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// --- Fallback runner ---------------------------------------
export async function withFallback(
  configs: { provider: LLMProvider; model?: string }[],
  req: LLMRequest
): Promise<LLMResponse> {
  if (MOCK) {
    return {
      text:
        `**[MOCK RESPONSE]**\n\nYou asked:\n\n${req.prompt.slice(0, 800)}\n\n` +
        `(Set LLM_MOCK=0 and add an API key to hit real models.)`,
      usage: { input: 0, output: 0 },
      model: "mock-model",
      provider: "mock",
    };
  }

  // 1) Keep only configs for which we actually have a key
  const filtered: { provider: LLMProvider; model: string }[] = [];
  for (const c of configs) {
    if (hasKey(c.provider)) {
      filtered.push({ provider: c.provider, model: c.model || DEFAULT_MODEL[c.provider] });
    }
  }

  // 2) If none remain, auto-augment with any available providers (Gemini first)
  if (filtered.length === 0) {
    for (const p of availableProviders()) {
      filtered.push({ provider: p, model: DEFAULT_MODEL[p] });
    }
  } else {
    // 3) Append additional available providers not already listed (as secondary fallbacks)
    const present = new Set(filtered.map(c => c.provider));
    for (const p of availableProviders()) {
      if (!present.has(p)) filtered.push({ provider: p, model: DEFAULT_MODEL[p] });
    }
  }

  if (filtered.length === 0) {
    throw new Error(
      "No LLM providers configured. Set one of GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY, " +
      "or set LLM_MOCK=1 for mock replies."
    );
  }

  let lastErr: unknown;
  for (const cfg of filtered) {
    try {
      const res = await makeClient(cfg.provider, cfg.model).generate(req);
      return res;
    } catch (e) {
      lastErr = e;
      // try the next provider
    }
  }

  throw lastErr ?? new Error(
    "All LLM fallbacks failed. Tried: " + filtered.map(f => `${f.provider}:${f.model}`).join(", ")
  );
}
