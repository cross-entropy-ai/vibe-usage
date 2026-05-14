import { useEffect, useRef, useState } from "react";
import type {
  SessionDetail as SessionDetailType,
  SessionMessage,
  ToolCall,
} from "@/types/sessions";
import { MessageBubble } from "./message-bubble";
import { ToolCallGroup } from "./tool-call-group";

type RenderUnit =
  | {
      kind: "message";
      msg: SessionMessage;
      callsBefore: ToolCall[];
      callsAfter: ToolCall[];
      key: string;
    }
  | { kind: "tool-orphans"; calls: ToolCall[]; key: string };

/**
 * Group rule: only CONSECUTIVE tool-only assistant messages accumulate
 * into a run. When the run ends:
 *   - if the next message is a text-bearing assistant, attach the run
 *     to its card (so the card shows text + a collapsible "N tool calls")
 *   - otherwise (user / system / session end), the run becomes its own
 *     standalone card and the breaking message renders normally
 * Any non-tool-only message ends the run.
 */
function buildUnits(messages: SessionMessage[], sessionId: string): RenderUnit[] {
  const units: RenderUnit[] = [];
  let runCalls: ToolCall[] = [];
  let runStart = -1;

  const flushOrphan = () => {
    if (runCalls.length === 0) return;
    units.push({
      kind: "tool-orphans",
      calls: runCalls,
      key: `${sessionId}-orphans-${runStart}`,
    });
    runCalls = [];
    runStart = -1;
  };

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const hasText = !!m.content.trim();
    const hasTools = m.tool_calls.length > 0;
    const isToolOnlyAsst = m.role === "assistant" && hasTools && !hasText;

    if (isToolOnlyAsst) {
      if (runStart < 0) runStart = i;
      runCalls.push(...m.tool_calls);
      continue;
    }

    if (m.role === "assistant" && hasText) {
      units.push({
        kind: "message",
        msg: m,
        callsBefore: runCalls,
        callsAfter: m.tool_calls,
        key: `${sessionId}-msg-${i}`,
      });
      runCalls = [];
      runStart = -1;
      continue;
    }

    if (m.role === "assistant" && !hasText && !hasTools) {
      // empty assistant — skip (rare/never in real data)
      continue;
    }

    // user / system message: end the run as an orphan, then render
    flushOrphan();
    units.push({
      kind: "message",
      msg: m,
      callsBefore: [],
      callsAfter: [],
      key: `${sessionId}-msg-${i}`,
    });
  }

  flushOrphan();
  return units;
}

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
  onDelete,
}: {
  detail: SessionDetailType | null;
  loading: boolean;
  error: string | null;
  onDelete?: (id: string) => Promise<void> | void;
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
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm(
                  "Delete this session and all its local files? This is irreversible. " +
                    "If you have remote rsync sync enabled, the next pull may bring back any " +
                    "copies still on remote hosts.",
                );
                if (!ok) return;
                void onDelete(detail.id);
              }}
              className="ml-auto rounded border border-rose-300 px-2 py-0.5 text-[11px] text-rose-600 hover:bg-rose-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {buildUnits(visible, detail.id).map((unit) =>
            unit.kind === "message" ? (
              <MessageBubble
                key={unit.key}
                message={unit.msg}
                callsBefore={unit.callsBefore}
                callsAfter={unit.callsAfter}
                forceToolDetails={showToolDetails}
              />
            ) : (
              <div key={unit.key} className="rounded-md bg-slate-50/60 px-3 py-2">
                <div className="mb-1.5 text-[11px] font-medium text-slate-500">
                  🤖 assistant
                </div>
                <ToolCallGroup
                  calls={unit.calls}
                  forceOpen={showToolDetails}
                />
              </div>
            ),
          )}
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
