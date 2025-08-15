import mongoose, { Schema, InferSchemaType } from "mongoose";

const ModelConfigSchema = new Schema({
  provider: { type: String, required: true }, // openai | anthropic | ollama | hf
  model: { type: String, required: true },
  parameters: { type: Schema.Types.Mixed, default: {} },
  capabilities: [{ type: String }], // "summary","extraction","narrative","reasoning"
  usage: {
    tokensInput: { type: Number, default: 0 },
    tokensOutput: { type: Number, default: 0 },
    calls: { type: Number, default: 0 },
  },
}, { timestamps: true });

export type ModelConfigDoc = InferSchemaType<typeof ModelConfigSchema>;
export default mongoose.model("ModelConfig", ModelConfigSchema);
