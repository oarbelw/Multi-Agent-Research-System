import { Router } from "express";
import Conversation from "../db/models/Conversation.js";

const r = Router();

r.get("/:conversationId/state", async (req,res)=>{
  const c = await Conversation.findById(req.params.conversationId);
  if (!c) return res.status(404).json({error:"not found"});
  res.json({ topic: c.topic || "", phase: c.phase || "research" });
});

r.patch("/:conversationId", async (req,res)=>{
  const { topic, phase } = req.body || {};
  const upd:any = {};
  if (topic !== undefined) upd.topic = String(topic);
  if (phase !== undefined) upd.phase = String(phase);
  const c = await Conversation.findByIdAndUpdate(req.params.conversationId, upd, { new: true });
  res.json({ topic: c?.topic || "", phase: c?.phase || "research" });
});

r.get("/recent/topics", async (_req,res)=>{
  const rows = await Conversation.aggregate([
    { $match: { topic: { $ne: "" } } },
    { $sort: { updatedAt: -1 } },
    { $group: { _id: "$topic", conversationId: { $first: "$_id" }, updatedAt: { $first: "$updatedAt" } } },
    { $sort: { updatedAt: -1 } },
    { $limit: 30 }
  ]);
  res.json(rows.map(r => ({ topic: r._id, conversationId: r.conversationId, updatedAt: r.updatedAt })));
});

export default r;
