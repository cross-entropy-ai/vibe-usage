import { useCallback, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import type { SessionDetail, SessionListItem } from "@/types/sessions";
import {
  deleteSession,
  fetchSessionDetail,
  fetchSessionList,
} from "@/lib/sessions-api";
import { ProjectNav } from "@/components/sessions/project-nav";
import { SessionList } from "@/components/sessions/session-list";
import { SessionDetail as SessionDetailPane } from "@/components/sessions/session-detail";

export default function SessionsPage() {
  const [params, setParams] = useSearchParams();
  const project = params.get("project");
  const tool = params.get("tool") ?? "all";
  const q = params.get("q") ?? "";
  const id = params.get("id");

  const [items, setItems] = useState<SessionListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [allForNav, setAllForNav] = useState<SessionListItem[]>([]);
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

  // List for current filters
  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setItems([]);
    fetchSessionList({ project, tool, q })
      .then((r) => {
        if (!cancelled) setItems(r.sessions);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, tool, q]);

  // Independent fetch for the nav counts (no filters)
  useEffect(() => {
    let cancelled = false;
    fetchSessionList({ limit: 2000 })
      .then((r) => {
        if (!cancelled) setAllForNav(r.sessions);
      })
      .catch(() => {
        if (!cancelled) setAllForNav([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = useCallback(
    async (sid: string) => {
      try {
        await deleteSession(sid);
        // Clear detail + URL id
        setDetail(null);
        setDetailError(null);
        update({ id: null });
        // Refetch both lists so counts and rows reflect the deletion
        const [filtered, all] = await Promise.all([
          fetchSessionList({ project, tool, q }),
          fetchSessionList({ limit: 2000 }),
        ]);
        setItems(filtered.sessions);
        setAllForNav(all.sessions);
      } catch (e) {
        // eslint-disable-next-line no-alert
        window.alert(`Could not delete session: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [project, tool, q, update],
  );

  // Detail
  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    fetchSessionDetail(id)
      .then((d) => {
        if (cancelled) return;
        if (d == null) {
          setDetail(null);
          setDetailError("Session not found");
          // clear stale id
          update({ id: null });
        } else {
          setDetail(d);
        }
      })
      .catch((e) => {
        if (!cancelled) setDetailError(String(e));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
            items={allForNav}
            selected={project}
            onSelect={(p) => update({ project: p, id: null })}
          />
        </aside>
        <section className="flex w-[360px] flex-none flex-col border-r border-slate-200 bg-white">
          <SessionList
            items={items}
            selectedId={id}
            q={q}
            tool={tool}
            loading={listLoading}
            onQuery={(v) => update({ q: v })}
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
