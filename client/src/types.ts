export type Level = "Domain" | "Project" | "Room" | "Agent";

export type Provider = "openai" | "anthropic" | "gemini" | "mock";

export interface ModelConfig {
  provider?: Provider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
}

export interface Traits {
  curiosity?: number; thoroughness?: number; creativity?: number; analytical?: number;
  communication?: number; structure?: number; clarity?: number; persuasiveness?: number;
}

export interface ContextDoc {
  _id: string;
  name: string;
  level: Level;
  parentId?: string | null;
  researchTopic?: string;
  systemInstruction?: string;
  traits?: Traits;
  modelConfig?: ModelConfig;
  // allow arbitrary custom keys
  [key: string]: any;
}

export interface EffectivePayload {
  // effective merged properties returned by /contexts/:id/effective
  // if your server also returns origins, great; we’ll use them
  effective: ContextDoc;
  base?: ContextDoc;
  originByPath?: Record<string, string>; // e.g. "traits.curiosity" -> "<contextId>"
}
