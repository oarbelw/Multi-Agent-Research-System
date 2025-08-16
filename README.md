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

Multi-Agent-Research-System/

├─ docker-compose.yml                – Spins up client, server, MongoDB, and Neo4j containers.

├─ Mach33 Candidate Exercise.pdf     – Original spec/instructions for the project.

├─ client/

│  ├─ .dockerignore                  – Files to exclude from client Docker build context.

│  ├─ .gitignore                     – Files ignored by Git in the client folder.

│  ├─ Dockerfile                     – Builds the client (Vite) image for Docker.

│  ├─ eslint.config.js               – Linting rules for the client codebase.


│  ├─ index.html                     – Vite app HTML shell; mounts the React app.

│  ├─ package.json                   – Client dependencies and npm scripts.

│  ├─ package-lock.json              – Locked dependency tree for client.

│  ├─ tsconfig.app.json              – TS compiler options for app sources.

│  ├─ tsconfig.json                  – Base TS config (extends/refs others).

│  ├─ tsconfig.node.json             – TS config for Vite/node tooling.

│  ├─ vite.config.ts                 – Vite dev/build configuration.

│  └─ src/

│     ├─ assets/                     – Static assets (images, icons, etc.).

│     ├─ api.ts                      – Small fetch helpers for calling server APIs.

│     ├─ App.css                     – App-level CSS styles.

│     ├─ App.tsx                     – Main UI: contexts panel, chat, memories, graph, reports.

│     ├─ index.css                   – Global CSS reset/base styles.

│     ├─ main.tsx                    – React entrypoint; renders <App />.

│     ├─ types.ts                    – Shared TypeScript types for client state/models.

│     └─ vite-env.d.ts               – Vite/TS env typings (e.g., import.meta.env).

└─ server/

   ├─ .dockerignore                  – Files to exclude from server Docker build context.
   
   ├─ Dockerfile                     – Builds the server (Express/TS) image.
   
   ├─ package.json                   – Server dependencies and npm scripts.
   
   ├─ package-lock.json              – Locked dependency tree for server.
   
   ├─ tsconfig.json                  – TypeScript config for the server.
   
   ├─ .env.example                   – Template of required env vars (copy to .env).
   
   └─ src/
   
      ├─ index.ts                    – Express app bootstrap; mounts routes & DB connections.
      
      ├─ contexts/
      
      │  └─ inheritance.ts           – Computes effective properties via Context inheritance.
      
      ├─ db/
      
      │  ├─ graph.ts                 – Neo4j driver init and helpers.
      
      │  ├─ mongo.ts                 – MongoDB connection setup.
      
      │  └─ models/
      
      │     ├─ Context.ts            – Context schema (Domain/Project/Room/Agent).
      
      │     ├─ Conversation.ts       – Conversation schema (topic, phase, participants).
      
      │     ├─ Memory.ts             – Memory schema (type/importance/confidence + indexes).
      
      │     ├─ Message.ts            – Message schema (sender, metadata, timestamps).
      
      │     ├─ ModelConfig.ts        – Optional model config overrides per context.
      
      │     └─ Report.ts             – Report schema (structure, content, modelsUsed).
      
      ├─ routes/
      
      │  ├─ contexts.ts              – CRUD + /effective endpoints for contexts.
      
      │  ├─ conversations.ts         – Start/reuse by topic, send message, phase/topic APIs.
      
      │  ├─ graph.ts                 – Entity extraction + graph snapshot endpoints.
      
      │  ├─ memories.ts              – List/create/delete memories; force-extract.
      
      │  ├─ reports.ts               – Generate/list reports endpoints.
      
      │  └─ workflow.ts              – Phase management/metadata routes.
      
      ├─ scripts/
      
      │  ├─ seed.ts                  – Seeds demo Domain/Project/Room/Agents in Mongo.
      
      │  └─ smoke.ts                 – Quick end-to-end sanity checks (LLM + DB).
      
      └─ services/
      
         ├─ agents/
         
         │  └─ prompting.ts          – Builds role/phase-aware prompts for agents.
         
         ├─ llm/
         
         │  ├─ anthropic.ts          – Anthropic client wrapper.
         
         │  ├─ gemini.ts             – Google Gemini client wrapper.
         
         │  ├─ openai.ts             – OpenAI client wrapper.
         
         │  └─ index.ts              – Unified LLM interface + withFallback helper.
         
         ├─ conversation.ts          – Fan-out send; per-phase agent selection; memory hooks.
         
         ├─ entities.ts              – Entity extraction + Neo4j upserts/relationships.
         
         ├─ memory.ts                – Memory extraction/classification storage utilities.
         
         └─ report.ts                – Report structure + section generation using model packs.


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
