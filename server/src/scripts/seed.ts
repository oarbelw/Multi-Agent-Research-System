import "dotenv/config";
import Context from "../db/models/Context.js";
import { connectMongo } from "../db/mongo.js";

(async () => {
  await connectMongo(process.env.MONGO_URL!);

  const domain = await Context.create({
    name: "AI Research",
    level: "Domain",
    properties: { researchTopic: "Mach33 multi-agent", systemInstruction: "Be concise and helpful." },
    modelConfig: { provider: "anthropic", model: "claude-3-5-sonnet-latest" }
  });

  const project = await Context.create({ name: "M33 Project", level: "Project", parentId: domain._id });
  const room = await Context.create({ name: "Exploration Room", level: "Room", parentId: project._id });

  const agents = await Context.insertMany([
    { name: "Researcher-1", level: "Agent", parentId: room._id, agentType: "Researcher", traits: { curiosity: 0.9, thoroughness: 0.8 } },
    { name: "Analyzer-1", level: "Agent", parentId: room._id, agentType: "Analyzer", traits: { analytical: 0.9, communication: 0.7 } },
    { name: "Author-1", level: "Agent", parentId: room._id, agentType: "Author", traits: { structure: 0.8, clarity: 0.9 } },
  ]);

  console.log("Seeded:", { domain: domain._id, project: project._id, room: room._id, agents: agents.map(a=>a._id) });
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
