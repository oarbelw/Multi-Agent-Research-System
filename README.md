# Multi-Agent-Research-System
Multi-Agent Research System

# 0) Repo Quickstart

## 1) Clone (HTTPS). Replace with your GitHub URL if different.
git clone https://github.com/oarbelw/Multi-Agent-Research-System.git
cd Multi-Agent-Research-System

## 2) Install deps
cd server && npm i && cd ..
cd client && npm i && cd ..

## 3) Bring up infra (MongoDB + Neo4j)
docker compose up -d

## 4) Configure server env
cd server
cp .env.example .env
### Edit .env with API keys + DB URIs (see .env fields below)

## 5) Run backend + frontend
npm run dev            # in /server
## in new terminal
cd ../client && npm run dev

## 6) Open the app
UI:      http://localhost:5173
Neo4j:   http://localhost:7474  (bolt://localhost:7687)

# 1) Project Layout

## 1) Project Layout

```text
Multi-Agent-Research-System/
├─ docker-compose.yml                — Spins up client, server, MongoDB, and Neo4j containers.
├─ Mach33 Candidate Exercise.pdf     — Original spec/instructions for the project.
├─ client/
│  ├─ .dockerignore                  — Exclude files from client Docker build context.
│  ├─ .gitignore                     — Git ignores for client.
│  ├─ Dockerfile                     — Builds the client (Vite) image.
│  ├─ eslint.config.js               — Client lint rules.
│  ├─ index.html                     — Vite HTML shell; mounts React app.
│  ├─ package.json                   — Client deps & scripts.
│  ├─ package-lock.json              — Locked deps.
│  ├─ tsconfig.app.json              — TS options for app sources.
│  ├─ tsconfig.json                  — Base TS config.
│  ├─ tsconfig.node.json             — TS for Vite/node tooling.
│  ├─ vite.config.ts                 — Vite dev/build config.
│  └─ src/
│     ├─ assets/                     — Static assets.
│     ├─ api.ts                      — Fetch helpers for server APIs.
│     ├─ App.css                     — App styles.
│     ├─ App.tsx                     — Main UI (contexts, chat, memories, graph, reports).
│     ├─ index.css                   — Global styles.
│     ├─ main.tsx                    — React entrypoint.
│     ├─ types.ts                    — Shared client types.
│     └─ vite-env.d.ts               — Vite env typings.
└─ server/
   ├─ .dockerignore                  — Exclude files from server Docker build.
   ├─ Dockerfile                     — Builds the server image.
   ├─ package.json                   — Server deps & scripts.
   ├─ package-lock.json              — Locked deps.
   ├─ tsconfig.json                  — Server TS config.
   ├─ .env.example                   — Template env vars (copy to .env).
   └─ src/
      ├─ index.ts                    — Express bootstrap; routes & DB connections.
      ├─ contexts/
      │  └─ inheritance.ts           — Effective properties via Context inheritance.
      ├─ db/
      │  ├─ graph.ts                 — Neo4j driver init & helpers.
      │  ├─ mongo.ts                 — MongoDB connection.
      │  └─ models/
      │     ├─ Context.ts            — Context schema (Domain/Project/Room/Agent).
      │     ├─ Conversation.ts       — Conversation schema (topic, phase, participants).
      │     ├─ Memory.ts             — Memory schema (type/importance/confidence + indexes).
      │     ├─ Message.ts            — Message schema (sender, metadata, timestamps).
      │     ├─ ModelConfig.ts        — Optional model config overrides per context.
      │     └─ Report.ts             — Report schema (structure, content, modelsUsed).
      ├─ routes/
      │  ├─ contexts.ts              — CRUD + /effective.
      │  ├─ conversations.ts         — Start/reuse topic, send, phase/topic APIs.
      │  ├─ graph.ts                 — Entity extraction + graph snapshot endpoints.
      │  ├─ memories.ts              — List/create/delete memories; force-extract.
      │  ├─ reports.ts               — Generate/list reports.
      │  └─ workflow.ts              — Phase management/metadata routes.
      ├─ scripts/
      │  ├─ seed.ts                  — Seeds demo Domain/Project/Room/Agents.
      │  └─ smoke.ts                 — End-to-end sanity checks.
      └─ services/
         ├─ agents/
         │  └─ prompting.ts          — Role/phase-aware prompt builder.
         ├─ llm/
         │  ├─ anthropic.ts          — Anthropic client wrapper.
         │  ├─ gemini.ts             — Google Gemini client wrapper.
         │  ├─ openai.ts             — OpenAI client wrapper.
         │  └─ index.ts              — Unified LLM interface + withFallback.
         ├─ conversation.ts          — Fan-out send; per-phase agent selection; memory hooks.
         ├─ entities.ts              — Entity extraction + Neo4j upserts/relationships.
         ├─ memory.ts                — Memory extraction/classification storage.
         └─ report.ts                — Report structure + section generation (model packs).
text```


# 2) Environment & Docker

Server .env (copy from .env.example):

### API

PORT=4000

MONGO_URL=mongodb://localhost:27017/mach33

### LLM (optional; set LLM_MOCK=1 to skip)

OPENAI_API_KEY=

ANTHROPIC_API_KEY=

GEMINI_API_KEY=

LLM_MOCK=1

### Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password123
