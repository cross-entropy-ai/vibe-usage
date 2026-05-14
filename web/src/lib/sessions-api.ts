import type { SessionDetail, SessionListResponse } from "@/types/sessions";

export interface ListParams {
  project?: string | null;
  tool?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

export async function fetchSessionList(params: ListParams): Promise<SessionListResponse> {
  const search = new URLSearchParams();
  if (params.project) search.set("project", params.project);
  if (params.tool && params.tool !== "all") search.set("tool", params.tool);
  if (params.q) search.set("q", params.q);
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  const res = await fetch(`/api/sessions/list?${search.toString()}`);
  if (!res.ok) throw new Error(`session list failed: ${res.status}`);
  return res.json();
}

export async function fetchSessionDetail(id: string): Promise<SessionDetail | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`session detail failed: ${res.status}`);
  return res.json();
}

export async function deleteSession(id: string): Promise<{ deleted: string[] }> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      detail = body?.error ? `: ${body.error}` : "";
    } catch {
      // body is not JSON; ignore
    }
    throw new Error(`delete session failed (${res.status})${detail}`);
  }
  return res.json();
}
