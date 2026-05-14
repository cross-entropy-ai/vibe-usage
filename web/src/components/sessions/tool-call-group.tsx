import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolCall } from "@/types/sessions";
import { ToolCallRow } from "./tool-call-row";

export function ToolCallGroup({
  calls,
  forceOpen,
}: {
  calls: ToolCall[];
  forceOpen: boolean;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = forceOpen || localOpen;

  if (calls.length === 0) return null;

  const errorCount = calls.filter((c) => c.status === "error").length;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (!forceOpen) {
            setLocalOpen((v) => !v);
          }
        }}
        className="flex w-full items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-left text-[12px] font-medium text-slate-600 hover:bg-slate-50"
      >
        <ChevronRight
          className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span>
          {calls.length} tool call{calls.length === 1 ? "" : "s"}
        </span>
        {errorCount > 0 && (
          <span className="ml-1 text-rose-600">
            · {errorCount} error{errorCount > 1 ? "s" : ""}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-3">
          {calls.map((call, i) => (
            <ToolCallRow key={i} call={call} forceOpen={forceOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
