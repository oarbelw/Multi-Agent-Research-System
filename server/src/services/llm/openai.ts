import type { LLMClient, LLMRequest, LLMResponse } from "./index.js";

export class OpenAIClient implements LLMClient {
  // Lazy-load the SDK to avoid ESM import edge cases
  private clientPromise: Promise<any>;

  constructor(private model: string) {
    this.clientPromise = (async () => {
      const mod: any = await import("openai");
      const OpenAI = mod.default ?? mod;
      return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    })();
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const client = await this.clientPromise;

    const res = await client.chat.completions.create({
      model: this.model,
      messages: [
        ...(req.system ? [{ role: "system", content: req.system }] : []),
        { role: "user", content: req.prompt }
      ],
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 512
    });

    // Make TS happy and be safe at runtime
    const choice = res?.choices?.[0];
    const text = choice?.message?.content ?? "";

    const inputTokens = res?.usage?.prompt_tokens ?? 0;
    const outputTokens = res?.usage?.completion_tokens ?? 0;

    return {
      text,
      usage: { input: inputTokens, output: outputTokens },
      model: this.model,
      provider: "openai"
    };
  }
}
