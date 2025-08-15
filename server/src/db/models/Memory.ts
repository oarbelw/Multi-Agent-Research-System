import mongoose, { Schema, InferSchemaType } from "mongoose";

const MemorySchema = new Schema({
  content:      { type: String, required: true, index: "text" },
  // Final classified type
  type:         { type: String, enum: ["fact", "insight", "question", "action"], required: true, index: true },

  // Where it came from
  source:       { type: String, required: true, index: true }, // e.g. "agent:<contextId>" or "user"
  sourceMessageId: { type: Schema.Types.ObjectId, ref: "Message", index: true },
  conversationId:  { type: Schema.Types.ObjectId, ref: "Conversation", index: true },

  // Scores
  timestamp:    { type: Date, default: () => new Date(), index: true },
  confidence:   { type: Number, min: 0, max: 1, default: 0.7, index: true },
  importance:   { type: Number, min: 0, max: 1, default: 0.5, index: true },

  // Models used
  extractedBy:  { type: String, index: true }, // "<provider>:<model>"
  classifiedBy: { type: String, index: true },

  // Optional: track which phase we were in when created, and which agent produced the source message
  phase:        { type: String, enum: ["research","analysis","synthesis","report"], default: "research", index: true },
  agentName:    { type: String, index: true },
  agentType:    { type: String, index: true },

  // Optional: vector embeddings (if you later add embedding support)
  embedding:    { type: [Number], default: undefined }
}, { timestamps: true });

MemorySchema.index({ conversationId: 1, importance: -1, confidence: -1, timestamp: -1 });
MemorySchema.index({ type: 1, importance: -1 });
MemorySchema.index({ source: 1, timestamp: -1 });

export type MemoryDoc = InferSchemaType<typeof MemorySchema>;
export default mongoose.model("Memory", MemorySchema);
