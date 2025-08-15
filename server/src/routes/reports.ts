import { Router } from "express";
import Report from "../db/models/Report.js";
import { generateReport } from "../services/report.js";
const r = Router();

r.post("/", async (req, res, next) => { try { res.json(await generateReport({
  conversationId: req.body.conversationId,
  title: req.body.title ?? "Research Report",
  format: req.body.format ?? "standard",
})); } catch (e) { next(e); }});

r.get("/", async (_req, res) => { res.json(await Report.find().sort({ createdAt: -1 }).limit(50)); });
export default r;
