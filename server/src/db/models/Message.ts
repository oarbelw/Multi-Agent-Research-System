import mongoose, { Schema, InferSchemaType } from "mongoose";

const MessageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  sender: { type: String, enum: ["user", "agent", "system"], required: true },
  senderContextId: { type: Schema.Types.ObjectId, ref: "Context" },
  content: { type: String, required: true },
  metadata: {
    modelProvider: String,
    model: String,
    tokensInput: Number,
    tokensOutput: Number,
    error: String,
  },
  timestamp: { type: Date, default: () => new Date(), index: true },
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, timestamp: 1 });

export type MessageDoc = InferSchemaType<typeof MessageSchema>;
export default mongoose.model("Message", MessageSchema);
