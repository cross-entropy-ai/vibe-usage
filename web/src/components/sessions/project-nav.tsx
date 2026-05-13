import { useMemo } from "react";
import type { SessionListItem } from "@/types/sessions";

const NO_PROJECT_KEY = "__none__";

export function ProjectNav({
  items,
  selected,
  onSelect,
}: {
  items: SessionListItem[];
  selected: string | null;
  onSelect: (project: string | null) => void;
}) {
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      const key = it.project ?? NO_PROJECT_KEY;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const total = items.length;

  function Row({ k, label, count }: { k: string | null; label: string; count: number }) {
    const isActive = (selected ?? null) === k;
    return (
      <button
        type="button"
        onClick={() => onSelect(k)}
        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-[13px] ${
          isActive ? "bg-slate-200 text-slate-900" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        <span className="truncate">{label}</span>
        <span className="ml-2 text-[11px] text-slate-500">{count}</span>
      </button>
    );
  }

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      <Row k={null} label="All projects" count={total} />
      <div className="my-1 border-t border-slate-200" />
      {groups.map(([key, count]) => (
        <Row
          key={key}
          k={key}
          label={key === NO_PROJECT_KEY ? "(no project)" : key}
          count={count}
        />
      ))}
    </nav>
  );
}
