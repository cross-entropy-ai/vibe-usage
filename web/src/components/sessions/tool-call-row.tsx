import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolCall } from "@/types/sessions";

function previewArgs(call: ToolCall): string {
  if (!call.args) return "";
  if (typeof call.args === "string") return call.args;
  const str = JSON.stringify(call.args);
  return str.length > 50 ? str.slice(0, 50) + "..." : str;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function ToolCallRow({ call, forceOpen }: { call: ToolCall; forceOpen?: boolean }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = forceOpen ?? localOpen;
  const isError = call.status === "error";

  return (
    <div className="rounded border border-slate-200 bg-white text-[12px]">
      <button
        type="button"
        onClick={() => setLocalOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono"
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
