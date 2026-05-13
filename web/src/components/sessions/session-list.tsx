import { formatDistanceToNow } from "date-fns";
import type { SessionListItem } from "@/types/sessions";

const TOOLS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "kimi", label: "Kimi" },
];

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export function SessionList({
  items,
  selectedId,
  q,
  tool,
  onQuery,
  onTool,
  onSelect,
  loading,
}: {
  items: SessionListItem[];
  selectedId: string | null;
  q: string;
  tool: string;
  onQuery: (v: string) => void;
  onTool: (v: string) => void;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-slate-200 p-2">
        <input
          type="search"
          placeholder="🔍 search messages…"
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1 text-[13px]"
        />
        <div className="flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onTool(t.value)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                tool === t.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 text-[12px] text-slate-500">Loading…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="p-3 text-[12px] text-slate-500">No sessions match.</div>
        )}
        {items.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`block w-full border-b border-slate-100 px-3 py-2 text-left ${
                active ? "border-l-2 border-l-sky-500 bg-sky-50/60" : "hover:bg-slate-50"
              }`}
            >
              <div className="truncate text-[13px] font-medium text-slate-900">
                {item.title}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">
                {formatDistanceToNow(new Date(item.start_time), { addSuffix: true })}
                {" · "}{item.tool}
                {" · "}{item.message_count} msg
                {" · "}{fmtTokens(item.token_total)}
              </div>
              {item.match_preview && (
                <div className="mt-1 truncate text-[11px] text-slate-600 italic">
                  …{item.match_preview}…
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
