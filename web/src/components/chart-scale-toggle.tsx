import type { ScaleMode } from "@/lib/contexts";

interface ChartScaleToggleProps {
  scale: ScaleMode;
  onToggle: () => void;
}

export function ChartScaleToggle({ scale, onToggle }: ChartScaleToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
      title={`Switch to ${scale === "log" ? "linear" : "log"} scale`}
    >
      {scale}
    </button>
  );
}
