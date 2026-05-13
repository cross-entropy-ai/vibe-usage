import { useEffect, useRef, useState } from "react";
import type { SessionDetail as SessionDetailType } from "@/types/sessions";
import { MessageBubble } from "./message-bubble";

const INITIAL_RENDER = 50;
const PAGE_INC = 50;

function totalTokens(d: SessionDetailType): number {
  let total = 0;
  for (const m of d.messages) {
    const t = m.tokens;
    if (!t) continue;
    total += (t.input ?? 0) + (t.output ?? 0) + (t.thinking ?? 0);
  }
  return total;
}

export function SessionDetail({
  detail,
  loading,
  error,
}: {
  detail: SessionDetailType | null;
  loading: boolean;
  error: string | null;
}) {
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER);
  const [showToolDetails, setShowToolDetails] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRenderCount(INITIAL_RENDER);
    setShowToolDetails(false);
  }, [detail?.id]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !detail) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setRenderCount((c) => Math.min(c + PAGE_INC, detail.messages.length));
      }
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, [detail, renderCount]);

  if (loading) {
    return <div className="p-4 text-[13px] text-slate-500">Loading…</div>;
  }
  if (error) {
    return <div className="p-4 text-[13px] text-rose-600">{error}</div>;
  }
  if (!detail) {
    return (
      <div className="p-4 text-[13px] text-slate-500">
        Pick a session from the list.
      </div>
    );
  }

  const visible = detail.messages.slice(0, renderCount);
  const tokens = totalTokens(detail);

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-3">
        <div className="truncate text-[14px] font-semibold text-slate-900">
          {detail.messages.find((m) => m.role === "user" && m.content.trim())?.content
            ?.split("\n")[0]
            ?.slice(0, 100) ?? "(no prompt)"}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">
          {new Date(detail.start_time).toLocaleString()}
          {detail.model ? ` · ${detail.model}` : ""}
          {detail.cwd ? ` · ${detail.cwd}` : ""}
          {` · ${detail.messages.length} msg`}
          {` · ${tokens.toLocaleString()} tok`}
          {detail.estimated_cost_usd != null && detail.estimated_cost_usd > 0 && (
            ` · $${detail.estimated_cost_usd.toFixed(detail.estimated_cost_usd < 0.01 ? 4 : 2)}`
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
          >
            Copy link
          </button>
          <label className="flex items-center gap-1 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={showToolDetails}
              onChange={(e) => setShowToolDetails(e.target.checked)}
            />
            Show tool details
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {visible.map((m, i) => (
            <MessageBubble
              key={`${detail.id}-${i}`}
              message={m}
              forceToolDetails={showToolDetails}
            />
          ))}
        </div>
        {renderCount < detail.messages.length && (
          <div ref={sentinelRef} className="py-4 text-center text-[11px] text-slate-400">
            Loading more…
          </div>
        )}
      </div>
    </div>
  );
}
