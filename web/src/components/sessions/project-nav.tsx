import type { ProjectCount } from "@/lib/sessions-api";

const NO_PROJECT_KEY = "__none__";

export function ProjectNav({
  projects,
  total,
  selected,
  onSelect,
}: {
  projects: ProjectCount[];
  total: number;
  selected: string | null;
  onSelect: (project: string | null) => void;
}) {
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
      {projects.map((p) => {
        const key = p.project ?? NO_PROJECT_KEY;
        return (
          <Row
            key={key}
            k={key}
            label={p.project ?? "(no project)"}
            count={p.count}
          />
        );
      })}
    </nav>
  );
}
