import mongoose, { Schema, InferSchemaType } from "mongoose";

const ConversationSchema = new Schema({
  title: { type: String, required: true },
  participantIds: [{ type: Schema.Types.ObjectId, ref: "Context", index: true }],
  status: { type: String, enum: ["active", "archived"], default: "active", index: true },

  // workflow fields
  topic: { type: String, index: true }, // shared research topic
  phase: {
    type: String,
    enum: ["research", "analysis", "synthesis", "report"],
    default: "research",
    index: true
  },
  phaseHistory: [{
    phase: String,
    at: { type: Date, default: () => new Date() }
  }],
  createdAt: { type: Date, default: () => new Date(), index: true },
  updatedAt: { type: Date, default: () => new Date(), index: true }
}, { timestamps: true });

export type ConversationDoc = InferSchemaType<typeof ConversationSchema>;
export default mongoose.model("Conversation", ConversationSchema);
