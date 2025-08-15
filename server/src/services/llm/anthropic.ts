import type { LLMClient, LLMRequest, LLMResponse } from "./index.js";

export class AnthropicClient implements LLMClient {
  private clientPromise: Promise<any>;
  constructor(private model: string) {
    this.clientPromise = (async () => {
      const mod: any = await import("@anthropic-ai/sdk");
      const Anthropic = mod.default ?? mod;
      return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    })();
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const client = await this.clientPromise;
    const res = await client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 512,
      temperature: req.temperature ?? 0.2,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }]
    });

    const text = (res?.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((t: any) => t.text)
      .join("\n");

    const inputTokens = res?.usage?.input_tokens ?? 0;
    const outputTokens = res?.usage?.output_tokens ?? 0;

    return {
      text,
      usage: { input: inputTokens, output: outputTokens },
      model: this.model,
      provider: "anthropic"
    };
  }
}
