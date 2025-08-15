import mongoose, { Schema, InferSchemaType } from "mongoose";

const ReportSchema = new Schema({
  // link back to session (optional but very useful)
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", index: true },
  topic: { type: String, default: "", index: true },

  title: { type: String, required: true },
  format: { type: String, enum: ["executive", "standard", "comprehensive"], required: true },
  detailLevel: { type: String, enum: ["brief", "balanced", "in-depth"], required: true },

  // plan + rendered sections
  structure: { type: Schema.Types.Mixed, default: {} },
  content: { type: Schema.Types.Mixed, default: {} }, // sections keyed object, each markdown

  sourceMemoryIds: [{ type: Schema.Types.ObjectId, ref: "Memory" }],
  versionNumber: { type: Number, default: 1 },

  // which models were used for which purpose
  modelsUsed: [{ provider: String, model: String, purpose: String }],
}, { timestamps: true });

ReportSchema.index({ createdAt: -1 });
ReportSchema.index({ conversationId: 1, createdAt: -1 });

export type ReportDoc = InferSchemaType<typeof ReportSchema>;
export default mongoose.model("Report", ReportSchema);
