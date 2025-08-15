import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { connectMongo } from "./db/mongo.js";
import { getNeo4jDriver, closeNeo4j } from "./db/graph.js";
import contexts from "./routes/contexts.js";
import conversations from "./routes/conversations.js";
import memories from "./routes/memories.js";
import reports from "./routes/reports.js";
import workflow from "./routes/workflow.js";
import graph from "./routes/graph.js";
import reportRoutes from "./routes/reports.js";
import memoryRoutes from "./routes/memories.js";
import conversationsRoutes from "./routes/conversations.js";
import graphRoutes from "./routes/graph.js";


const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.use("/contexts", contexts);
app.use("/conversations", conversations);
app.use("/memories", memories);
app.use("/workflow", workflow);
app.use("/graph", graph);
app.use("/reports", reports);
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/graph", graphRoutes);
app.use("/reports", reportRoutes);
app.use("/memories", memoryRoutes);
app.use("/conversations", conversationsRoutes);

const port = Number(process.env.PORT ?? 4000);

(async () => {
  await connectMongo(process.env.MONGO_URL!);
  await getNeo4jDriver().verifyConnectivity();
  app.listen(port, () => console.log(`API on :${port}`));
})().catch(err => {
  console.error("Startup error", err);
  process.exit(1);
});

process.on("SIGINT", async () => { await closeNeo4j(); process.exit(0); });
