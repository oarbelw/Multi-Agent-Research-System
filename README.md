## Multi-Agent-Research-System
Multi-Agent Research System

# 1) Clone (HTTPS). Replace with your GitHub URL if different.
git clone https://github.com/oarbelw/Multi-Agent-Research-System.git
cd Multi-Agent-Research-System

# 2) Install deps
cd server && npm i && cd ..
cd client && npm i && cd ..

# 3) Bring up infra (MongoDB + Neo4j)
docker compose up -d

# 4) Configure server env
cd server
cp .env.example .env
# Edit .env with API keys + DB URIs (see .env fields below)

# 5) Run backend + frontend
npm run dev            # in /server
# in new terminal
cd ../client && npm run dev

# 6) Open the app
# UI:      http://localhost:5173
# Neo4j:   http://localhost:7474  (bolt://localhost:7687)
