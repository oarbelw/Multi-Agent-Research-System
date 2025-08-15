import { Router } from "express";
import Context from "../db/models/Context.js";
import { getEffectiveContext } from "../contexts/inheritance.js";
const r = Router();

r.post("/", async (req, res, next) => { try { res.json(await Context.create(req.body)); } catch (e) { next(e); }});
r.get("/", async (_req, res) => { res.json(await Context.find().limit(200).sort({ level: 1, name: 1 })); });
r.get("/:id/effective", async (req, res, next) => { try { res.json(await getEffectiveContext(req.params.id)); } catch (e) { next(e); }});
r.patch("/:id", async (req, res, next) => { try { res.json(await Context.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (e) { next(e); }});

export default r;
