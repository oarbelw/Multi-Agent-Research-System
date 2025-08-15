import { Router } from "express";
import { getGraphSnapshot } from "../services/entities.js";
const r = Router();

r.get("/snapshot", async (req, res, next) => {
  try { res.json(await getGraphSnapshot(Number(req.query.limit) || 120)); }
  catch (e) { next(e); }
});

export default r;
