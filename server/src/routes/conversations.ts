import { Router } from "express";
import Conversation from "../db/models/Conversation.js";
import Message from "../db/models/Message.js";
import { sendUserMessage } from "../services/conversation.js";

type Phase = "research" | "analysis" | "synthesis" | "report";

const r = Router();

r.post("/", async (req, res, next) => {
  try {
    res.json(await Conversation.create({
      title: req.body?.title ?? "Research Session",
      participantIds: req.body?.participantIds ?? [],
    }));
  } catch (e) { next(e); }
});

r.get("/:id/messages", async (req, res) => {
  res.json(await Message.find({ conversationId: req.params.id }).sort({ timestamp: 1 }).limit(500));
});

r.post("/:id/send", async (req, res, next) => {
  try { res.json(await sendUserMessage(req.params.id, req.body.content)); }
  catch (e) { next(e); }
});

// set / change topic
r.patch("/:id/topic", async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).end();
  convo.topic = req.body.topic ?? null;
  await convo.save();
  res.json(convo);
});

// advance / set phase
r.post("/:id/phase", async (req, res) => {
  const next: Phase = (req.body?.next as Phase) || "analysis";
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).end();

  convo.phase = next || "research";
  // Use push so TS is happy with DocumentArray typing
  (convo as any).phaseHistory = (convo as any).phaseHistory || [];
  (convo as any).phaseHistory.push({ phase: next, at: new Date() });

  await convo.save();
  res.json(convo);
});

// list distinct topics (latest convo for each)
r.get("/topics", async (_req, res) => {
  const latest = await Conversation.aggregate([
    { $match: { topic: { $ne: null } } },
    { $sort: { updatedAt: -1 } },
    {
      $group: {
        _id: "$topic",
        conversationId: { $first: "$_id" },
        topic: { $first: "$topic" },
        phase: { $first: "$phase" },
        updatedAt: { $first: "$updatedAt" },
      }
    },
    { $sort: { updatedAt: -1 } },
    { $limit: 50 },
  ]);
  res.json(latest);
});

export default r;