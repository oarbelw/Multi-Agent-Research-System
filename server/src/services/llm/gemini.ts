import type { LLMClient, LLMRequest, LLMResponse } from "./index.js";

export class GeminiClient implements LLMClient {
  private clientPromise: Promise<any>;
  constructor(private model: string) {
    this.clientPromise = (async () => {
      const mod: any = await import("@google/generative-ai");
      const { GoogleGenerativeAI } = mod;
      return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    })();
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const genAI = await this.clientPromise;

    const model = genAI.getGenerativeModel({
      model: this.model,
      ...(req.system ? { systemInstruction: req.system } : {})
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxTokens ?? 512
      }
    });

    const text = result?.response?.text?.() ?? "";
    const usage = result?.response?.usageMetadata;

    return {
      text,
      usage: {
        input: usage?.promptTokenCount ?? 0,
        output: usage?.candidatesTokenCount ?? 0
      },
      model: this.model,
      provider: "gemini"
    };
  }
}
