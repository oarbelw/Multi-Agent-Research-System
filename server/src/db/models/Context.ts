import mongoose, { Schema, InferSchemaType, Types } from "mongoose";

export type ContextLevel = "Domain" | "Project" | "Room" | "Agent";

const ModelConfigSchema = new Schema({
  provider: { type: String, required: true },
  model: { type: String, required: true },
  temperature: { type: Number, default: 0.2 },
  maxTokens: { type: Number, default: 2048 },
  contextWindow: { type: Number, default: 128000 },
  parameters: { type: Schema.Types.Mixed },
}, { _id: false });

const ContextSchema = new Schema({
  name: { type: String, required: true, index: true },
  level: { type: String, required: true, enum: ["Domain", "Project", "Room", "Agent"], index: true },
  parentId: { type: Schema.Types.ObjectId, ref: "Context", default: null, index: true },
  properties: { type: Schema.Types.Mixed, default: {} },
  // agent-specific:
  agentType: { type: String, enum: ["Researcher", "Analyzer", "Synthesizer", "Author"], required: function(this:any){return this.level==="Agent";} },
  traits: {
    curiosity: { type: Number, min: 0, max: 1, default: 0.5 },
    thoroughness: { type: Number, min: 0, max: 1, default: 0.5 },
    creativity: { type: Number, min: 0, max: 1, default: 0.5 },
    analytical: { type: Number, min: 0, max: 1, default: 0.5 },
    communication: { type: Number, min: 0, max: 1, default: 0.5 },
    // Author-only extras
    structure: { type: Number, min: 0, max: 1, default: 0.5 },
    clarity: { type: Number, min: 0, max: 1, default: 0.5 },
    persuasiveness: { type: Number, min: 0, max: 1, default: 0.5 },
  },
  modelConfig: ModelConfigSchema, // inheritable
}, { timestamps: true });

ContextSchema.index({ parentId: 1, level: 1 });
ContextSchema.index({ "properties.isActive": 1 });

export type ContextDoc = InferSchemaType<typeof ContextSchema> & { _id: Types.ObjectId };
export default mongoose.model("Context", ContextSchema);
