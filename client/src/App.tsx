import React, { useEffect, useMemo, useRef, useState } from "react";

const API = (import.meta.env.VITE_API as string) || "http://localhost:4000";

/** ===== Types ===== */
type Level = "Domain" | "Project" | "Room" | "Agent";
type Provider = "openai" | "anthropic" | "gemini" | "mock";

type Traits = {
  curiosity?: number; thoroughness?: number; creativity?: number; analytical?: number;
  communication?: number; structure?: number; clarity?: number; persuasiveness?: number;
};

type ModelConfig = {
  provider?: Provider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
};

type ContextDoc = {
  _id: string;
  name: string;
  level: Level;
  parentId?: string | null;
  researchTopic?: string;
  systemInstruction?: string;
  traits?: Traits;
  modelConfig?: ModelConfig;
  [key: string]: any;
};

type EffectivePayload = {
  effective: ContextDoc;
  base?: ContextDoc;
  originByPath?: Record<string, string>;
} | ContextDoc;

type MemoryType = "fact"|"insight"|"question"|"action";
type MemoryDoc = {
  _id: string;
  contextId: string;
  sourceMessageId?: string;
  sourceRole: "user"|"agent"|"system";
  sourceAgentId?: string | null;
  text: string;
  type: MemoryType;
  confidence: number;
  importance: number;
  modelExtract?: string;
  modelClassify?: string;
  createdAt: string;
};

/** ===== Markdown (tiny) ===== */
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
}
function renderMarkdown(src: string) {
  src = src.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre style="background:#0f172a; color:#e5e7eb; padding:10px; border-radius:8px; overflow:auto;"><code>${escapeHtml(code.trim())}</code></pre>`);
  src = src.replace(/`([^`]+)`/g, (_m, code) => `<code style="background:#f3f4f6; padding:2px 4px; border-radius:4px;">${escapeHtml(code)}</code>`);
  src = src.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  src = src.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" target="_blank" rel="noreferrer">$1</a>`);
  src = src.replace(/^######\s*(.*)$/gm, "<h6>$1</h6>").replace(/^#####\s*(.*)$/gm, "<h5>$1</h5>").replace(/^####\s*(.*)$/gm, "<h4>$1</h4>").replace(/^###\s*(.*)$/gm, "<h3>$1</h3>").replace(/^##\s*(.*)$/gm, "<h2>$1</h2>").replace(/^#\s*(.*)$/gm, "<h1>$1</h1>");
  src = src.replace(/^(?:\s*[-*]\s.*(?:\n|$))+?/gm, (block) => {
    const items = block.trim().split(/\n/).map(line => `<li>${line.replace(/^\s*[-*]\s/, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  src = src.split(/\n{2,}/).map(p => p.startsWith("<") ? p : `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
  return src;
}

/** ===== API helpers ===== */
async function listContexts(): Promise<ContextDoc[]> {
  const r = await fetch(`${API}/contexts`); if (!r.ok) throw new Error("Failed to fetch contexts"); return r.json();
}
async function getContext(id: string): Promise<ContextDoc> {
  const r = await fetch(`${API}/contexts/${id}`); if (!r.ok) throw new Error("Failed to fetch context"); return r.json();
}
async function getEffective(id: string): Promise<EffectivePayload> {
  const r = await fetch(`${API}/contexts/${id}/effective`); if (!r.ok) throw new Error("Failed to fetch effective properties"); return r.json();
}
async function patchContext(id: string, patch: Partial<ContextDoc>): Promise<ContextDoc> {
  const r = await fetch(`${API}/contexts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  if (!r.ok) throw new Error(await r.text()); return r.json();
}
async function safeGetContext(id: string): Promise<ContextDoc | null> { try { return await getContext(id); } catch { return null; } }

// --- Research workflow helpers ---
async function reuseConversationByTopic(topic: string) {
  return fetch(`${API}/conversations/reuse`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ topic })
  }).then(r=>r.json());
}
async function setConversationTopic(id:string, topic:string) {
  return fetch(`${API}/conversations/${id}/topic`, {
    method:"PATCH", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ topic })
  }).then(r=>r.json());
}
async function setPhase(id:string, next:"research"|"analysis"|"synthesis"|"report") {
  return fetch(`${API}/conversations/${id}/phase`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ next })
  }).then(r=>r.json());
}
async function listTopics() { return fetch(`${API}/conversations/topics`).then(r=>r.json()); }
async function graphSnapshot(limit=120) { return fetch(`${API}/graph/snapshot?limit=${limit}`).then(r=>r.json()); }
async function createReport(conversationId:string, title:string, format:"executive"|"standard"|"comprehensive", style:"concise"|"narrative"|"technical"="concise") {
  return fetch(`${API}/reports`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ conversationId, title, format, style })
  }).then(r=>r.json());
}

// Memories with filters
type MemQuery = { type?: MemoryType|""; sourceAgentId?: string; minImportance?: number; model?: string; q?: string; sort?: "newest"|"importance"|"confidence" };
async function listMemories(contextId: string, q: MemQuery = {}): Promise<MemoryDoc[]> {
  const url = new URL(`${API}/memories`, location.origin);
  url.searchParams.set("contextId", contextId);
  if (q.type) url.searchParams.set("type", q.type);
  if (q.sourceAgentId) url.searchParams.set("sourceAgentId", q.sourceAgentId);
  if (q.minImportance != null) url.searchParams.set("minImportance", String(q.minImportance));
  if (q.model) url.searchParams.set("model", q.model);
  if (q.q) url.searchParams.set("q", q.q);
  if (q.sort) url.searchParams.set("sort", q.sort);
  const r = await fetch(url.toString()); if (!r.ok) throw new Error(await r.text()); return r.json();
}
async function createMemory(input: Partial<MemoryDoc>): Promise<MemoryDoc> {
  const r = await fetch(`${API}/memories`, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(input) });
  if (!r.ok) throw new Error(await r.text()); return r.json();
}
async function deleteMemory(id: string): Promise<void> {
  const r = await fetch(`${API}/memories/${id}`, { method: "DELETE" }); if (!r.ok) throw new Error(await r.text());
}

/** ===== Tree ===== */
const LEVEL_ORDER: Level[] = ["Domain", "Project", "Room", "Agent"];
const TRAIT_KEYS: Array<keyof Traits> = ["curiosity","thoroughness","creativity","analytical","communication","structure","clarity","persuasiveness"];
type Node = ContextDoc & { children: Node[] };
function buildTree(items: ContextDoc[]): Node[] {
  const byId = new Map<string, Node>(); items.forEach(c => byId.set(c._id, { ...c, children: [] }));
  const roots: Node[] = [];
  for (const n of byId.values()) { if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n); else roots.push(n); }
  const rank = (l: Level) => LEVEL_ORDER.indexOf(l);
  const sortNode = (n: Node) => { n.children.sort((a,b)=> rank(a.level)-rank(b.level) || a.name.localeCompare(b.name)); n.children.forEach(sortNode); };
  roots.sort((a,b)=> rank(a.level)-rank(b.level) || a.name.localeCompare(b.name)); roots.forEach(sortNode); return roots;
}

/** ===== UI atoms ===== */
function Badge({ children, color = "#ddd" }: { children: React.ReactNode; color?: string }) {
  return <span style={{ fontSize: 12, padding: "2px 6px", borderRadius: 999, border: `1px solid ${color}`, color }}>{children}</span>;
}
function Row({
  children,
  gap = 8,
  align = "center",
  style,
  className,
}: {
  children: React.ReactNode;
  gap?: number;
  align?: "center" | "start" | "end";
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: align, gap, ...(style || {}) }}
    >
      {children}
    </div>
  );
}
function AgentBadge({ name }: { name: string }) {
  return (
    <span style={{
      fontSize:12, padding:"2px 8px", borderRadius:999,
      background:"#eef2ff", border:"1px solid #c7d2fe", color:"#3730a3"
    }}>
      {name}
    </span>
  );
}

/** ===== Provider inference + agent resolution ===== */
function inferProvider(model?: string): string | undefined {
  if (!model) return undefined; const s = model.toLowerCase();
  if (s.includes("gemini")) return "gemini";
  if (s.includes("claude")) return "anthropic";
  if (s.includes("gpt")) return "openai";
  return undefined;
}
function guessAgentNameByModel(contexts: ContextDoc[], provider?: string, model?: string): string | undefined {
  const agents = contexts.filter(c => c.level === "Agent");
  let found = agents.find(a => a.modelConfig?.model && model && a.modelConfig?.model === model);
  if (found) return found.name;
  found = agents.find(a => a.modelConfig?.provider && provider && a.modelConfig?.provider === provider);
  return found?.name;
}

/** ===== App ===== */
export default function App() {
  // contexts
  const [contexts, setContexts] = useState<ContextDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [base, setBase] = useState<ContextDoc | null>(null);
  const [effective, setEffective] = useState<ContextDoc | null>(null);
  const [originByPath, setOriginByPath] = useState<Record<string,string> | undefined>();
  const [loadingTree, setLoadingTree] = useState(false);
  const [leftError, setLeftError] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(contexts), [contexts]);

  // fast lookup
  const contextsById = useMemo(() => {
    const m = new Map<string, ContextDoc>();
    contexts.forEach(c => m.set(c._id, c));
    return m;
  }, [contexts]);

  // edit form
  const [form, setForm] = useState<Partial<ContextDoc>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // memories (for selected context)
  const [memories, setMemories] = useState<MemoryDoc[]>([]);
  const [memErr, setMemErr] = useState<string | null>(null);
  const [newMem, setNewMem] = useState<{type:"fact"|"insight"|"question"|"action"; importance:number; text:string}>({ type:"insight", importance:0.5, text:"" });
  const [memFilter, setMemFilter] = useState<MemQuery>({ sort: "newest", minImportance: 0 });

  // conversation
  const [conversation, setConversation] = useState<any|null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [dots, setDots] = useState(".");
  const [modelStats, setModelStats] = useState<Record<string, { lastMs: number; lastAt: number }>>({});
  const sendMarkRef = useRef<number | null>(null);

  async function refreshContexts() {
    setLoadingTree(true); setLeftError(null);
    try { const list = await listContexts(); setContexts(list); if (!selectedId && list.length) setSelectedId(list[0]._id); }
    catch (e:any) { setLeftError(e?.message || String(e)); }
    finally { setLoadingTree(false); }
  }
  useEffect(() => { refreshContexts(); }, []);

  async function loadMem(contextId: string, q: MemQuery = memFilter) {
    try { setMemErr(null); setMemories(await listMemories(contextId, q)); }
    catch (e:any) { setMemErr(e?.message || String(e)); }
  }

  // --- Topic + phase state/UI ---
  const [topic, setTopic] = useState<string>("");
  const [topics, setTopics] = useState<any[]>([]);
  const [phase, setPhaseState] = useState<"research"|"analysis"|"synthesis"|"report">("research");

  async function startOrReuseByTopic() {
    if (!topic.trim()) return;
    const convo = await reuseConversationByTopic(topic.trim());
    setConversation(convo);
    setPhaseState(convo.phase || "research");
    setMessages(await fetch(`${API}/conversations/${convo._id}/messages`).then(r=>r.json()));
  }
  useEffect(()=>{ listTopics().then(setTopics).catch(()=>{}); },[]);

  async function selectContext(id: string) {
    setSelectedId(id); setLeftError(null);
    const localBase = contexts.find(c => c._id === id) || null;
    if (localBase) setBase(localBase);
    try {
      const [freshBase, effPayload] = await Promise.all([safeGetContext(id), getEffective(id)]);
      const b = freshBase ?? localBase!; setBase(b);
      const eff = (effPayload as any).effective ?? effPayload; setEffective(eff as ContextDoc);
      setOriginByPath((effPayload as any).originByPath);
      setForm({ researchTopic: b.researchTopic ?? "", systemInstruction: b.systemInstruction ?? "", traits: { ...(b.traits || {}) }, modelConfig: { ...(b.modelConfig || {}) } });
      await loadMem(id);
    } catch (e:any) { if (!localBase) setLeftError(e?.message || String(e)); }
  }

  async function saveLocal() {
    if (!base) return;
    try {
      setSaving(true); setSaveError(null);
      const patch: Partial<ContextDoc> = {
        researchTopic: form.researchTopic?.trim() || undefined,
        systemInstruction: form.systemInstruction?.trim() || undefined,
        traits: form.traits, modelConfig: form.modelConfig
      };
      const updated = await patchContext(base._id, patch);
      setBase(updated);
      const effPayload = await getEffective(base._id);
      const eff = (effPayload as any).effective ?? effPayload;
      setEffective(eff as ContextDoc);
      setOriginByPath((effPayload as any).originByPath);
    } catch (e:any) { setSaveError(e?.message || String(e)); }
    finally { setSaving(false); }
  }

  // typing dots
  useEffect(() => { if (!typing) return; const t = setInterval(() => setDots(d => (d.length >= 3 ? "." : d + ".")), 350); return () => clearInterval(t); }, [typing]);

  async function startConversation() {
    const agents = contexts.filter(c=>c.level==="Agent").slice(0,3).map(c=>c._id);
    const convo = await fetch(`${API}/conversations`, { method:"POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: topic || "Research Session", participantIds:agents }) }).then(r=>r.json());
    if (topic) await setConversationTopic(convo._id, topic);
    setConversation({ ...convo, topic });
    setPhaseState(convo.phase || "research");
    const msgs = await fetch(`${API}/conversations/${convo._id}/messages`).then(r=>r.json());
    setMessages(msgs);
  }

  function classifyMessage(m: any): "user" | "system" | "agent" {
    const s = (m.sender || "").toLowerCase();
    if (s === "user") return "user"; if (s === "system") return "system"; return "agent";
  }

  async function send() {
    if (!conversation || !input.trim()) return;
    const id = conversation._id;
    sendMarkRef.current = Date.now();
    setTyping(true);

    await fetch(`${API}/conversations/${id}/send`, { method:"POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: input }) });
    setInput("");

    let msgs = await fetch(`${API}/conversations/${id}/messages`).then(r=>r.json());
    const baseline = msgs.length; setMessages(msgs);

    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      await new Promise(r => setTimeout(r, 700));
      msgs = await fetch(`${API}/conversations/${id}/messages`).then(r=>r.json());
      if (msgs.length > baseline) {
        setMessages(msgs);
        const arrived = msgs.slice(baseline);
        const elapsed = (sendMarkRef.current ? Date.now() - sendMarkRef.current : 0);
        const copy = { ...modelStats };
        for (const m of arrived) {
          if (classifyMessage(m) !== "agent") continue;
          const tag = `${m.metadata?.provider || inferProvider(m.metadata?.model) || "unknown"}:${m.metadata?.model ?? "?"}`;
          copy[tag] = { lastMs: elapsed, lastAt: Date.now() };
        }
        setModelStats(copy);
        break;
      }
    }
    setTyping(false); sendMarkRef.current = null;
  }

  // inheritance badges
  type BadgeInfo = { label: string; color: string; local: boolean };
  const localBadge = (): BadgeInfo => ({ label:"local", color:"#16a34a", local:true });
  const inhBadge   = (from?: string): BadgeInfo => ({ label: from ? `from ${from}` : "inherited", color:"#7c3aed", local:false });
  function badgeFor(path: string, baseVal: any, effVal: any): BadgeInfo {
    if (originByPath && originByPath[path]) return originByPath[path] === base?._id ? localBadge() : inhBadge(originByPath[path]);
    const local = baseVal !== undefined && baseVal !== null; return local ? localBadge() : inhBadge();
  }

  // memory helpers
  async function addMemoryFromText(text: string, contextId?: string) {
    const cid = contextId ?? selectedId ?? contexts.find(c=>c.level==="Agent")?._id;
    if (!cid) return;
    await createMemory({ contextId: cid, type: "insight", importance: 0.5, text, sourceRole: "agent" as any });
    await loadMem(cid, memFilter);
  }

  // live-refresh memories while a conversation is active
  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => loadMem(selectedId, memFilter), conversation ? 2000 : 6000);
    return () => clearInterval(t);
  }, [selectedId, conversation, memFilter.type, memFilter.sourceAgentId, memFilter.minImportance, memFilter.model, memFilter.q, memFilter.sort]);

  // --- Report generation state ---
  const [reporting, setReporting] = useState(false);
  const [reportFormat, setReportFormat] = useState<"executive"|"standard"|"comprehensive">("standard");
  const [reportStyle, setReportStyle] = useState<"concise"|"narrative"|"technical">("concise");
  const [lastReport, setLastReport] = useState<any|null>(null);

  return (
    <div className="wrap" style={{ padding:16, display:"grid", gridTemplateColumns:"370px 1fr", gap:16 }}>
      {/* LEFT: hierarchy + inspector + memories */}
      <div className="panel" style={{ border:"1px solid #e5e7eb", borderRadius:10, padding:12 }}>
        <Row>
          <h3 style={{ margin:0 }}>Contexts</h3>
          <button onClick={refreshContexts} disabled={loadingTree} style={{ marginLeft:"auto", padding:"6px 10px", borderRadius:8 }}>
            {loadingTree ? "…" : "Refresh"}
          </button>
        </Row>
        {leftError && <div style={{ color:"#9ca3af", marginTop:8 }}>⚠ {leftError}</div>}

        <div className="list" style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
          {useMemo(() => buildTree(contexts), [contexts]).map(n => <TreeNode key={n._id} node={n} selectedId={selectedId} onSelect={selectContext} />)}
        </div>

        {base && effective && (
          <>
            <h4 style={{ marginTop:16 }}>Effective Properties</h4>
            <EffectiveView base={base} eff={effective} badgeFor={badgeFor} />

            <h4 style={{ marginTop:16 }}>Edit Local Properties</h4>
            <label style={{ fontWeight:600 }}>Research Topic</label>
            <input value={form.researchTopic ?? ""} onChange={e=>setForm(f => ({ ...f, researchTopic: e.target.value }))} style={{ width:"100%", padding:8, marginBottom:10 }} />
            <label style={{ fontWeight:600 }}>System Instruction</label>
            <textarea value={form.systemInstruction ?? ""} onChange={e=>setForm(f => ({ ...f, systemInstruction: e.target.value }))} style={{ width:"100%", padding:8, minHeight:80, marginBottom:10 }} />

            <h5>Traits (0..1)</h5>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0,1fr))", gap:8 }}>
              {TRAIT_KEYS.map(k => (
                <div key={k}>
                  <Row align="center" gap={6}>
                    <label style={{ fontSize:12, width:"100%" }}>{k}</label>
                    <Badge color={badgeFor(`traits.${k}`, base?.traits?.[k], effective?.traits?.[k]).color}>
                      {badgeFor(`traits.${k}`, base?.traits?.[k], effective?.traits?.[k]).label}
                    </Badge>
                  </Row>
                  <input type="number" step={0.1} min={0} max={1} value={form.traits?.[k] ?? ""} onChange={(e) => setForm(f => ({ ...f, traits: { ...(f.traits||{}), [k]: e.target.value === "" ? undefined : Number(e.target.value) } }))} style={{ width:"100%", padding:6 }} />
                </div>
              ))}
            </div>

            <h5 style={{ marginTop:12 }}>Model Settings</h5>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0,1fr))", gap:8 }}>
              <LabeledBadge label="provider" badge={badgeFor("modelConfig.provider", base?.modelConfig?.provider, effective?.modelConfig?.provider)}>
                <select value={form.modelConfig?.provider ?? ""} onChange={e => setForm(f => ({ ...f, modelConfig: { ...(f.modelConfig||{}), provider: (e.target.value || undefined) as Provider } }))} style={{ width:"100%", padding:6 }}>
                  <option value="">(inherit)</option><option value="gemini">gemini</option><option value="openai">openai</option><option value="anthropic">anthropic</option><option value="mock">mock</option>
                </select>
              </LabeledBadge>
              <LabeledBadge label="model" badge={badgeFor("modelConfig.model", base?.modelConfig?.model, effective?.modelConfig?.model)}>
                <input value={form.modelConfig?.model ?? ""} onChange={e => setForm(f => ({ ...f, modelConfig: { ...(f.modelConfig||{}), model: e.target.value || undefined } }))} style={{ width:"100%", padding:6 }} placeholder="gemini-2.0-flash / gpt-4o-mini / claude-3-5-haiku-latest" />
              </LabeledBadge>
              <LabeledBadge label="temperature" badge={badgeFor("modelConfig.temperature", base?.modelConfig?.temperature, effective?.modelConfig?.temperature)}>
                <input type="number" step={0.1} value={form.modelConfig?.temperature ?? ""} onChange={e => setForm(f => ({ ...f, modelConfig: { ...(f.modelConfig||{}), temperature: e.target.value === "" ? undefined : Number(e.target.value) } }))} style={{ width:"100%", padding:6 }} />
              </LabeledBadge>
              <LabeledBadge label="maxTokens" badge={badgeFor("modelConfig.maxTokens", base?.modelConfig?.maxTokens, effective?.modelConfig?.maxTokens)}>
                <input type="number" step={1} value={form.modelConfig?.maxTokens ?? ""} onChange={e => setForm(f => ({ ...f, modelConfig: { ...(f.modelConfig||{}), maxTokens: e.target.value === "" ? undefined : Number(e.target.value) } }))} style={{ width:"100%", padding:6 }} />
              </LabeledBadge>
              <LabeledBadge label="contextWindow" badge={badgeFor("modelConfig.contextWindow", base?.modelConfig?.contextWindow, effective?.modelConfig?.contextWindow)}>
                <input type="number" step={1} value={form.modelConfig?.contextWindow ?? ""} onChange={e => setForm(f => ({ ...f, modelConfig: { ...(f.modelConfig||{}), contextWindow: e.target.value === "" ? undefined : Number(e.target.value) } }))} style={{ width:"100%", padding:6 }} />
              </LabeledBadge>
            </div>
            {saveError && <div style={{ color:"#b91c1c", marginTop:8 }}>{saveError}</div>}
            <button onClick={saveLocal} disabled={saving} style={{ marginTop:12, padding:"8px 12px", borderRadius:8, background:"#2563eb", color:"#fff", border:"none", cursor:"pointer" }}>
              {saving ? "Saving…" : "Save changes"}
            </button>

            {/* Memories */}
            <h4 style={{ marginTop:18 }}>Memories</h4>
            {memErr && <div style={{ color:"#b91c1c" }}>{memErr}</div>}

            {/* Filters */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0,1fr))", gap:8, marginBottom:8 }}>
              <select value={memFilter.type ?? ""} onChange={e => setMemFilter(f=>({ ...f, type: (e.target.value || undefined) as any }))}>
                <option value="">type: all</option>
                <option value="fact">fact</option>
                <option value="insight">insight</option>
                <option value="question">question</option>
                <option value="action">action</option>
              </select>
              <select value={memFilter.sourceAgentId ?? ""} onChange={e => setMemFilter(f=>({ ...f, sourceAgentId: e.target.value || undefined }))}>
                <option value="">source: all</option>
                {contexts.filter(c=>c.level==="Agent").map(a=>(
                  <option key={a._id} value={a._id}>{a.name}</option>
                ))}
              </select>
              <input placeholder="model (extract/classify)" value={memFilter.model ?? ""} onChange={e=>setMemFilter(f=>({ ...f, model: e.target.value || undefined }))} />
              <input placeholder="search…" value={memFilter.q ?? ""} onChange={e=>setMemFilter(f=>({ ...f, q: e.target.value || undefined }))} />
              <div>
                <label style={{ fontSize:12 }}>min importance: {(memFilter.minImportance ?? 0).toFixed(2)}</label>
                <input type="range" min={0} max={1} step={0.05} value={memFilter.minImportance ?? 0} onChange={e=>setMemFilter(f=>({ ...f, minImportance: Number(e.target.value) }))} />
              </div>
              <select value={memFilter.sort ?? "newest"} onChange={e=>setMemFilter(f=>({ ...f, sort: e.target.value as any }))}>
                <option value="newest">sort: newest</option>
                <option value="importance">sort: importance</option>
                <option value="confidence">sort: confidence</option>
              </select>
              <button onClick={()=> selectedId && loadMem(selectedId, memFilter)} style={{ gridColumn:"1 / -1" }}>Apply filters</button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:260, overflow:"auto", border:"1px solid #eee", borderRadius:8, padding:8 }}>
              {memories.map(m => (
                <MemoryCard key={m._id} m={m} contextsById={contextsById} onDelete={async()=>{ await deleteMemory(m._id); if (base) await loadMem(base._id, memFilter); }} />
              ))}
              {!memories.length && <div style={{ color:"#9ca3af" }}>No memories match filters.</div>}
            </div>

            {/* Manual add (optional) */}
            <div style={{ marginTop:8, border:"1px dashed #cbd5e1", borderRadius:8, padding:8 }}>
              <Row gap={8}>
                <strong style={{ fontSize:13 }}>Add memory</strong>
                <Badge color="#6b7280">{newMem.type}</Badge>
                <Badge color="#22c55e">imp {newMem.importance.toFixed(2)}</Badge>
              </Row>
              <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"120px 1fr 140px", gap:8 }}>
                <select value={newMem.type} onChange={e=>setNewMem(v=>({ ...v, type: e.target.value as any }))}>
                  <option value="fact">fact</option><option value="insight">insight</option><option value="question">question</option><option value="action">action</option>
                </select>
                <input value={newMem.text} onChange={e=>setNewMem(v=>({ ...v, text:e.target.value }))} placeholder="What should be remembered?" />
                <input type="range" min={0} max={1} step={0.05} value={newMem.importance} onChange={e=>setNewMem(v=>({ ...v, importance:Number(e.target.value) }))} />
              </div>
              <button
                onClick={async()=>{ if (!base) return; await createMemory({ contextId: base._id, type:newMem.type, importance:newMem.importance, text:newMem.text, sourceRole:"agent" as any }); setNewMem({ ...newMem, text:"" }); await loadMem(base._id, memFilter); }}
                style={{ marginTop:8 }}
              >Save memory</button>
            </div>
          </>
        )}
      </div>

      {/* RIGHT: conversation + workflow */}
      <div className="panel" style={{ border:"1px solid #e5e7eb", borderRadius:10, padding:12 }}>
        {/* Topic row */}
        <Row>
          <input placeholder="Set research topic…" value={topic} onChange={e=>setTopic(e.target.value)} style={{ flex:1, padding:8, border:"1px solid #ddd", borderRadius:8 }}/>
          <button style={{ padding:"8px 12px", borderRadius:8 }} onClick={startOrReuseByTopic}>Start / Reuse</button>
          <select onChange={e=>setTopic(e.target.value)} value={topic} style={{ padding:8, borderRadius:8 }}>
            <option value="">(recent topics)</option>
            {topics.map(t => <option key={t.conversationId} value={t.topic}>{t.topic}</option>)}
          </select>
        </Row>

        {/* Phase controls + report controls */}
        <Row gap={8} align="center" style={{ marginTop:8 }}>
          <Badge color="#2563eb">phase: {phase}</Badge>
          <button
            disabled={!conversation}
            onClick={async ()=>{
              if (!conversation) return;
              const order = ["research","analysis","synthesis","report"] as const;
              const i = Math.max(0, order.indexOf(phase));
              const next = order[Math.min(i+1, order.length-1)];
              const updated = await setPhase(conversation._id, next);
              setPhaseState(updated.phase);
            }}
            style={{ padding:"6px 10px", borderRadius:8 }}
          >Next Phase</button>

          <div style={{ marginLeft:"auto", display:"flex", gap:8, flexWrap:"wrap" }}>
            <select value={reportFormat} onChange={e=>setReportFormat(e.target.value as any)}>
              <option value="executive">Executive</option>
              <option value="standard">Standard</option>
              <option value="comprehensive">Comprehensive</option>
            </select>
            <select value={reportStyle} onChange={e=>setReportStyle(e.target.value as any)}>
              <option value="concise">Concise</option>
              <option value="narrative">Narrative</option>
              <option value="technical">Technical</option>
            </select>
            <button disabled={!conversation || reporting}
              onClick={async ()=>{
                if (!conversation) return;
                setReporting(true);
                try {
                  const rep = await createReport(conversation._id, topic || "Research Report", reportFormat, reportStyle);
                  setLastReport(rep);
                } finally { setReporting(false); }
              }}
              style={{ padding:"6px 10px", borderRadius:8 }}
            >{reporting ? "Generating…" : "Generate Report"}</button>
          </div>
        </Row>

        {/* Start + model stats */}
        <Row style={{ marginTop:8 }}>
          <button onClick={startConversation} style={{ padding:"8px 12px", borderRadius:8 }}>Start Conversation</button>
          <div style={{ marginLeft:"auto", display:"flex", gap:8, flexWrap:"wrap" }}>
            {Object.entries(modelStats).map(([key, v]) => (
              <span key={key} title={`last ${Math.round(v.lastMs)}ms @ ${new Date(v.lastAt).toLocaleTimeString()}`}>
                <Badge color="#16a34a">{key} · {Math.round(v.lastMs)}ms</Badge>
              </span>
            ))}
            {!Object.keys(modelStats).length && <Badge color="#9ca3af">no model responses yet</Badge>}
          </div>
        </Row>

        {typing && <div style={{ marginTop:8, marginBottom:8, color:"#6b7280", fontSize:13 }}>Agents are thinking{dots}</div>}

        <div className="list" style={{height:"40vh", marginTop:12, overflow:"auto", display:"flex", flexDirection:"column", gap:12}}>
          {messages.map((m:any)=>(
            <MessageBubble key={m._id} m={m} contexts={contexts} contextsById={contextsById} onSaveMemory={addMemoryFromText} />
          ))}
          {!messages.length && <div style={{ color:"#9ca3af" }}>No messages yet.</div>}
        </div>

        {/* Input */}
        <div className="row" style={{ display:"flex", gap:8, marginTop:12 }}>
          <input placeholder="Ask something…" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={(e)=>{ if (e.key==="Enter") send(); }} style={{flex:1, padding:10, border:"1px solid #ddd", borderRadius:8}} />
          <button onClick={send} disabled={!conversation} style={{ padding:"8px 12px", borderRadius:8 }}>Send</button>
        </div>

        {/* Report preview */}
        {lastReport && (
          <div style={{ marginTop:12, border:"1px solid #eee", borderRadius:8, padding:12 }}>
            <Row><strong>Report: {lastReport.title}</strong><Badge color="#6b7280">{lastReport.format}</Badge></Row>
            {Object.entries(lastReport.content || {}).map(([k, sec]:any) => (
              <div key={k} style={{ marginTop:8 }}>
                <h4 style={{ margin:"6px 0" }}>{sec.title}</h4>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(sec.markdown || "") }} />
              </div>
            ))}
          </div>
        )}

        {/* Knowledge graph */}
        <GraphPanel messagesLen={messages.length} />
      </div>
    </div>
  );
}

/** ===== Subcomponents ===== */
function TreeNode({ node, selectedId, onSelect }: { node: Node; selectedId: string | null; onSelect: (id: string)=>void }) {
  const [open, setOpen] = useState(true);
  const isSelected = node._id === selectedId;
  const badge = node.level === "Agent" ? "[Agent]" : node.level === "Room" ? "[Room]" : node.level === "Project" ? "[Project]" : "[Domain]";
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        {node.children.length > 0 && (<button onClick={()=>setOpen(!open)} style={{ width:22 }}>{open ? "▾" : "▸"}</button>)}
        <button onClick={()=>onSelect(node._id)} style={{ padding:"6px 10px", borderRadius:6, border:isSelected ? "2px solid #2563eb" : "1px solid #ddd", background:isSelected ? "#eff6ff" : "#fff", cursor:"pointer" }} title={node._id}>
          {badge} {node.name}
        </button>
      </div>
      {open && node.children.length > 0 && (
        <div style={{ marginLeft:22, display:"flex", flexDirection:"column", gap:6 }}>
          {node.children.map(c => <TreeNode key={c._id} node={c} selectedId={selectedId} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

function LabeledBadge({ label, badge, children }:{ label:string; badge:{label:string;color:string}; children:React.ReactNode }) {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <label style={{ fontSize:12 }}>{label}</label>
        <Badge color={badge.color}>{badge.label}</Badge>
      </div>
      {children}
    </div>
  );
}

function PropCard({ title, value, badge }:{ title:string; value:any; badge:{label:string;color:string} }) {
  return (
    <div style={{ border:"1px solid #eee", borderRadius:8, padding:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <strong style={{ fontSize:12 }}>{title}</strong>
        <Badge color={badge.color}>{badge.label}</Badge>
      </div>
      <div style={{ whiteSpace:"pre-wrap", fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize:12 }}>
        {value ?? <span style={{ color:"#9ca3af" }}>—</span>}
      </div>
    </div>
  );
}

function EffectiveView({ base, eff, badgeFor }:{ base: ContextDoc; eff: ContextDoc; badgeFor: (path:string, baseVal:any, effVal:any)=>{label:string;color:string;local:boolean}; }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
      <PropCard title="Research Topic" value={eff.researchTopic} badge={badgeFor("researchTopic", base.researchTopic, eff.researchTopic)} />
      <PropCard title="System Instruction" value={eff.systemInstruction} badge={badgeFor("systemInstruction", base.systemInstruction, eff.systemInstruction)} />
      <div style={{ gridColumn:"1 / -1" }}>
        <strong>Traits</strong>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0,1fr))", gap:8, marginTop:6 }}>
          {TRAIT_KEYS.map(k => (<PropCard key={k} title={k} value={String(eff.traits?.[k] ?? "")} badge={badgeFor(`traits.${k}`, base.traits?.[k], eff.traits?.[k])} />))}
        </div>
      </div>
      <div style={{ gridColumn:"1 / -1" }}>
        <strong>Model Config</strong>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0,1fr))", gap:8, marginTop:6 }}>
          <PropCard title="provider" value={eff.modelConfig?.provider} badge={badgeFor("modelConfig.provider", base.modelConfig?.provider, eff.modelConfig?.provider)} />
          <PropCard title="model" value={eff.modelConfig?.model} badge={badgeFor("modelConfig.model", base.modelConfig?.model, eff.modelConfig?.model)} />
          <PropCard title="temperature" value={String(eff.modelConfig?.temperature ?? "")} badge={badgeFor("modelConfig.temperature", base.modelConfig?.temperature, eff.modelConfig?.temperature)} />
          <PropCard title="maxTokens" value={String(eff.modelConfig?.maxTokens ?? "")} badge={badgeFor("modelConfig.maxTokens", base.modelConfig?.maxTokens, eff.modelConfig?.maxTokens)} />
          <PropCard title="contextWindow" value={String(eff.modelConfig?.contextWindow ?? "")} badge={badgeFor("modelConfig.contextWindow", base.modelConfig?.contextWindow, eff.modelConfig?.contextWindow)} />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  m,
  contexts,
  contextsById,
  onSaveMemory
}:{ m:any; contexts: ContextDoc[]; contextsById: Map<string, ContextDoc>; onSaveMemory: (text: string, contextId?: string)=>void }) {
  const senderRaw = (m.sender || "").toLowerCase();
  const kind: "user" | "system" | "agent" = senderRaw === "user" ? "user" : senderRaw === "system" ? "system" : "agent";

  const provider = m.metadata?.provider || inferProvider(m.metadata?.model);
  const agentName =
    m.metadata?.agentName ||
    (m.metadata?.contextId && contextsById.get(m.metadata.contextId)?.name) ||
    guessAgentNameByModel(contexts, provider, m.metadata?.model) ||
    m.sender || "agent";

  const baseStyle: React.CSSProperties = { borderRadius: 12, padding: 12, border: "1px solid #e5e7eb" };
  const styleByKind: Record<typeof kind, React.CSSProperties> = {
    user: { background: "#f0f9ff", borderColor:"#bae6fd" },
    system: { background: "#fffbeb", borderColor:"#fde68a" },
    agent: { background: "#ffffff", borderColor:"#e5e7eb" },
  };

  const html = renderMarkdown(m.content || "");

  return (
    <div style={{ ...baseStyle, ...styleByKind[kind] }}>
      <div style={{fontSize:12, color:"#6b7280", marginBottom:4, display:"flex", gap:6, alignItems:"center"}}>
        <strong style={{ color:"#111827" }}>
          {kind === "agent" ? <AgentBadge name={agentName} /> : kind}
        </strong>
        {kind === "agent" && (
          <>
            {provider && <Badge color="#16a34a">{provider}</Badge>}
            {m.metadata?.model && <Badge color="#2563eb">{m.metadata.model}</Badge>}
            <button
              style={{ marginLeft:"auto", fontSize:12 }}
              title="Save this message to memory"
              onClick={()=> onSaveMemory(m.content || "", m.metadata?.contextId)}
            >
              Save to memory
            </button>
          </>
        )}
      </div>
      <div dangerouslySetInnerHTML={{__html: html}} />
    </div>
  );
}

function MemoryCard({ m, contextsById, onDelete }:{
  m: MemoryDoc;
  contextsById: Map<string, ContextDoc>;
  onDelete: () => void;
}) {
  const agentName = m.sourceAgentId ? (contextsById.get(m.sourceAgentId)?.name ?? "agent") : (m.sourceRole || "user");
  const typeColor = { fact:"#0ea5e9", insight:"#a855f7", question:"#f59e0b", action:"#16a34a" }[m.type];
  return (
    <div style={{ border:"1px solid #eee", borderRadius:8, padding:8 }}>
      <Row gap={8}>
        <Badge color={typeColor}>{m.type}</Badge>
        <Badge color="#6b7280">{agentName}</Badge>
        <Badge color="#22c55e">imp {(m.importance ?? 0).toFixed(2)}</Badge>
        <Badge color="#0ea5e9">conf {(m.confidence ?? 0).toFixed(2)}</Badge>
        {m.modelExtract && <Badge color="#2563eb">{m.modelExtract}</Badge>}
        {m.modelClassify && <Badge color="#2563eb">{m.modelClassify}</Badge>}
        <span style={{ marginLeft:"auto", fontSize:12, color:"#6b7280" }}>{new Date(m.createdAt).toLocaleString()}</span>
        <button onClick={onDelete} style={{ fontSize:12, marginLeft:8 }}>Delete</button>
      </Row>
      <div style={{ fontSize:13, marginTop:6, whiteSpace:"pre-wrap" }}>{m.text}</div>
    </div>
  );
}

/** ===== Graph panel ===== */
function GraphPanel({ messagesLen }: { messagesLen: number }) {
  const [data, setData] = useState<{nodes:any[];edges:any[]}>({nodes:[],edges:[]});

  useEffect(()=>{ graphSnapshot(120).then(setData).catch(()=>{}); }, [messagesLen]);

  const R = 180, cx = 400, cy = 220;
  const placed = data.nodes.map((n, i) => {
    const a = (i / Math.max(1,data.nodes.length)) * Math.PI*2;
    return { ...n, x: cx + R*Math.cos(a), y: cy + R*Math.sin(a) };
  });
  const byId:Record<string, any> = {}; placed.forEach(p=>byId[p.id]=p);

  return (
    <div style={{ border:"1px solid #eee", borderRadius:8, padding:8, marginTop:12 }}>
      <Row><strong>Knowledge Graph</strong><span style={{marginLeft:"auto"}}>{placed.length} nodes</span></Row>
      <svg width={800} height={460} style={{ width:"100%", background:"#fafafa", borderRadius:8 }}>
        {data.edges.map((e,i)=> {
          const a = byId[e.a], b = byId[e.b]; if (!a||!b) return null;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd5e1" strokeWidth={Math.max(1, (e.weight||0.2)*3)} />;
        })}
        {placed.map(n => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={12+Math.min(14,(n.mentions||1))} fill="#2563eb22" stroke="#2563eb" />
            <text x={n.x+18} y={n.y+4} fontSize="12" fill="#111827">{n.name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
