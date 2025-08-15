import { Router } from "express";
import Memory from "../db/models/Memory.js";
import { extractMemoriesForMessage } from "../services/memory.js";

const r = Router();

/**
 * GET /memories
 * Filters:
 *  - type: "fact|insight|question|action"
 *  - source: "user" or agentId string
 *  - conversationId: restrict to a single conversation
 *  - minImportance: number (0..1)
 *  - model: match extractedBy or classifiedBy (exact or substring)
 *  - q: full-text search in content
 *  - sort: "new", "importance", "confidence"
 *  - limit: default 200
 */
r.get("/", async (req, res, next) => {
  try {
    const {
      type,
      source,
      conversationId,
      minImportance,
      model,
      q,
      sort,
      limit,
    } = req.query as Record<string, string>;

    const cond: any = {};
    if (type) cond.type = type;
    if (source) cond.source = source;
    if (conversationId) cond.conversationId = conversationId;
    if (minImportance) cond.importance = { $gte: Number(minImportance) };
    if (model) {
      // match either field; allow substring match
      cond.$or = [
        { extractedBy: new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { classifiedBy: new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      ];
    }

    let query = Memory.find(cond);

    // full-text search override if q present
    if (q) {
      query = Memory.find({ $text: { $search: q }, ...cond });
    }

    // sort
    switch (sort) {
      case "importance":
        query = query.sort({ importance: -1, confidence: -1, timestamp: -1 });
        break;
      case "confidence":
        query = query.sort({ confidence: -1, importance: -1, timestamp: -1 });
        break;
      default:
        query = query.sort({ timestamp: -1 }); // "new"
    }

    const lim = Math.max(1, Math.min(1000, Number(limit) || 200));
    const docs = await query.limit(lim).lean();
    res.json(docs);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /memories/extract/:messageId
 * Manually trigger extraction/classification for a single message.
 */
r.post("/extract/:messageId", async (req, res, next) => {
  try {
    const out = await extractMemoriesForMessage(req.params.messageId);
    res.json(out);
  } catch (e) {
    next(e);
  }
});

export default r;
