import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import type { SessionDetail, SessionListItem } from "@/types/sessions";
import {
  deleteSession,
  fetchProjectCounts,
  fetchSessionDetail,
  fetchSessionList,
  type ProjectCount,
} from "@/lib/sessions-api";
import { ProjectNav } from "@/components/sessions/project-nav";
import { SessionList } from "@/components/sessions/session-list";
import { SessionDetail as SessionDetailPane } from "@/components/sessions/session-detail";

const QUERY_DEBOUNCE_MS = 200;

export default function SessionsPage() {
  const [params, setParams] = useSearchParams();
  const project = params.get("project");
  const tool = params.get("tool") ?? "all";
  const q = params.get("q") ?? "";
  const id = params.get("id");

  // Local input state for the search box so typing is responsive even
  // before the debounced URL update fires.
  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    // Keep input in sync if URL changes externally (back/forward, copy-paste).
    setQInput(q);
  }, [q]);

  const [items, setItems] = useState<SessionListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [navProjects, setNavProjects] = useState<ProjectCount[]>([]);
  const [navTotal, setNavTotal] = useState(0);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === "" || v === "all") next.delete(k);
          else next.set(k, v);
        }
        return next;
      });
    },
    [setParams],
  );

  // Debounce qInput → URL `q` param.
  const debounceTimer = useRef<number | null>(null);
  const onQueryChange = useCallback(
    (v: string) => {
      setQInput(v);
      if (debounceTimer.current != null) {
        window.clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = window.setTimeout(() => {
        update({ q: v });
      }, QUERY_DEBOUNCE_MS);
    },
    [update],
  );
  useEffect(
    () => () => {
      if (debounceTimer.current != null) window.clearTimeout(debounceTimer.current);
    },
    [],
  );

  // List for current filters (re-fetches when project/tool/q URL params change).
  useEffect(() => {
    const ac = new AbortController();
    setListLoading(true);
    setItems([]);
    fetchSessionList({ project, tool, q }, ac.signal)
      .then((r) => {
        if (!ac.signal.aborted) setItems(r.sessions);
      })
      .catch((e) => {
        if (!ac.signal.aborted) {
          // eslint-disable-next-line no-console
          console.warn("session list fetch failed", e);
          setItems([]);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setListLoading(false);
      });
    return () => ac.abort();
  }, [project, tool, q]);

  // Nav counts: one call per mount, no pagination.
  const refreshNav = useCallback(async () => {
    try {
      const r = await fetchProjectCounts();
      setNavProjects(r.projects);
      setNavTotal(r.total);
    } catch {
      setNavProjects([]);
      setNavTotal(0);
    }
  }, []);
  useEffect(() => {
    void refreshNav();
  }, [refreshNav]);

  const handleDelete = useCallback(
    async (sid: string) => {
      try {
        await deleteSession(sid);
        setDetail(null);
        setDetailError(null);
        update({ id: null });
        const filtered = await fetchSessionList({ project, tool, q });
        setItems(filtered.sessions);
        await refreshNav();
      } catch (e) {
        window.alert(
          `Could not delete session: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [project, tool, q, update, refreshNav],
  );

  // Detail
  useEffect(() => {
    const ac = new AbortController();
    if (!id) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    fetchSessionDetail(id, ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return;
        if (d == null) {
          setDetail(null);
          setDetailError("Session not found");
          update({ id: null });
        } else {
          setDetail(d);
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted) setDetailError(String(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setDetailLoading(false);
      });
    return () => ac.abort();
  }, [id, update]);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link to="/" className="text-[13px] text-slate-600 hover:text-slate-900">
          ← Dashboard
        </Link>
        <h1 className="text-[14px] font-semibold text-slate-900">Sessions</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[220px] flex-none border-r border-slate-200 bg-white">
          <ProjectNav
            projects={navProjects}
            total={navTotal}
            selected={project}
            onSelect={(p) => update({ project: p, id: null })}
          />
        </aside>
        <section className="flex w-[360px] flex-none flex-col border-r border-slate-200 bg-white">
          <SessionList
            items={items}
            selectedId={id}
            q={qInput}
            tool={tool}
            loading={listLoading}
            onQuery={onQueryChange}
            onTool={(v) => update({ tool: v })}
            onSelect={(sid) => update({ id: sid })}
          />
        </section>
        <main className="flex-1 overflow-hidden bg-white">
          <SessionDetailPane
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onDelete={handleDelete}
          />
        </main>
      </div>
    </div>
  );
}
