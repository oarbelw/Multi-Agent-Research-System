import "dotenv/config";
import { connectMongo } from "../db/mongo.js";
import Conversation from "../db/models/Conversation.js";
import Context from "../db/models/Context.js";
import { sendUserMessage } from "../services/conversation.js";
import Message from "../db/models/Message.js";

(async () => {
  await connectMongo(process.env.MONGO_URL!);

  const agents = await Context.find({ level: "Agent" }).limit(3);
  if (agents.length === 0) throw new Error("Run npm run seed first");

  const convo = await Conversation.create({ title: "Smoke Test", participantIds: agents.map(a=>a._id) });
  console.log("Convo:", convo._id);

  const result = await sendUserMessage(String(convo._id), "What are the main risks and opportunities in this topic?");
  console.log("Sent. Agent replies:", result.agentMessages.length);

  const msgs = await Message.find({ conversationId: convo._id }).sort({ timestamp: 1 });
  console.log("Messages:", msgs.length);
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
