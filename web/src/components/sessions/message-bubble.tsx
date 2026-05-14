import type { SessionMessage, ToolCall } from "@/types/sessions";
import { Markdown } from "./markdown";
import { ToolCallGroup } from "./tool-call-group";

export function MessageBubble({
  message,
  callsBefore,
  callsAfter,
  forceToolDetails,
}: {
  message: SessionMessage;
  callsBefore?: ToolCall[];
  callsAfter?: ToolCall[];
  forceToolDetails: boolean;
}) {
  const before = callsBefore ?? [];
  const after = callsAfter ?? message.tool_calls;
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">
        system message
      </div>
    );
  }

  const bg = isUser ? "bg-sky-50" : "bg-slate-50";
  const label = isUser ? "👤 user" : "🤖 assistant";
  const time = new Date(message.timestamp).toLocaleTimeString();

  return (
    <div className={`${bg} rounded-md px-3 py-2`}>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-slate-500">
        <span>{label}</span>
        <span>·</span>
        <span>{time}</span>
        {message.model && (
          <>
            <span>·</span>
            <span className="font-mono">{message.model}</span>
          </>
        )}
        {(message.tokens?.thinking ?? 0) > 0 && (
          <>
            <span>·</span>
            <span title="thinking tokens">
              🧠 {(message.tokens!.thinking ?? 0).toLocaleString()}
            </span>
          </>
        )}
      </div>
      {before.length > 0 && (
        <div className="mb-2">
          <ToolCallGroup calls={before} forceOpen={forceToolDetails} />
        </div>
      )}
      {message.content && <Markdown>{message.content}</Markdown>}
      {after.length > 0 && (
        <div className="mt-2">
          <ToolCallGroup calls={after} forceOpen={forceToolDetails} />
        </div>
      )}
    </div>
  );
}
