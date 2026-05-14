import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolCall } from "@/types/sessions";

function previewArgs(call: ToolCall): string {
  const args = call.args;
  if (args == null || typeof args !== "object") return "";
  const obj = args as Record<string, unknown>;
  for (const key of ["file_path", "path", "command", "pattern", "url", "query"]) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  const json = JSON.stringify(obj);
  return json.length > 80 ? json.slice(0, 77) + "…" : json;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCallRow({ call, forceOpen }: { call: ToolCall; forceOpen?: boolean }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = forceOpen || localOpen;
  const isError = call.status === "error";

  return (
    <div className="rounded border border-slate-200 bg-white text-[12px]">
      <button
        type="button"
        disabled={!!forceOpen}
        onClick={() => {
          // When the global toggle is forcing this open, ignore clicks so we
          // don't desync localOpen — otherwise turning the toggle off later
          // leaves some rows surprisingly open/closed based on stale clicks.
          if (forceOpen) return;
          setLocalOpen((v) => !v);
        }}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono disabled:cursor-default"
      >
        <ChevronRight
          className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className={isError ? "text-rose-600" : "text-sky-700"}>
          {call.name}
        </span>
        <span className="ml-1 truncate text-slate-500">{previewArgs(call)}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] leading-5 text-slate-700">
          {formatJson(call.args)}
        </pre>
      )}
    </div>
  );
}
