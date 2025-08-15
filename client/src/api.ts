import type { ContextDoc, EffectivePayload } from "./types";

export const API = (import.meta.env.VITE_API as string) || "http://localhost:4000";

export async function listContexts(): Promise<ContextDoc[]> {
  const r = await fetch(`${API}/contexts`);
  if (!r.ok) throw new Error("Failed to fetch contexts");
  return r.json();
}

export async function getContext(id: string): Promise<ContextDoc> {
  const r = await fetch(`${API}/contexts/${id}`);
  if (!r.ok) throw new Error("Failed to fetch context");
  return r.json();
}

export async function getEffective(id: string): Promise<EffectivePayload> {
  const r = await fetch(`${API}/contexts/${id}/effective`);
  if (!r.ok) throw new Error("Failed to fetch effective context");
  // Some backends return just the effective doc; normalize
  const data = await r.json();
  if (data.effective) return data as EffectivePayload;
  return { effective: data } as EffectivePayload;
}

export async function patchContext(id: string, patch: Partial<ContextDoc>): Promise<ContextDoc> {
  const r = await fetch(`${API}/contexts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
