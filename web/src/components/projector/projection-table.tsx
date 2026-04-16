import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmtUsd } from "@/lib/formatters";
import type { ProjectionResult } from "@/lib/projector-calc";

export type CostMode = "with_cache" | "without_cache";
export type SortKey = "model" | "provider" | "cost" | "diff";
export interface SortState { key: SortKey; asc: boolean }

interface Props {
  data: ProjectionResult[];
  mode: CostMode;
  providerFilter: string;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  currentModels: string[];
  currentCost: number;
}

const MODE_LABELS: Record<CostMode, { title: string; description: string }> = {
  with_cache: { title: "With Cache", description: "Projected cost preserving your cache hit ratio" },
  without_cache: { title: "Without Cache", description: "Projected cost treating all tokens as raw input/output" },
};

export function ProjectionTable({ data, mode, providerFilter, sort, onSortChange, currentModels, currentCost }: Props) {

  const costOf = (row: ProjectionResult) =>
    mode === "with_cache" ? row.cost_with_cache : row.cost_without_cache;

  const diffOf = (row: ProjectionResult) =>
    currentCost > 0 ? ((costOf(row) - currentCost) / currentCost) * 100 : 0;

  const sorted = useMemo(() => {
    const list = [...data];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "model": cmp = a.model.localeCompare(b.model); break;
        case "provider": cmp = a.provider.localeCompare(b.provider); break;
        case "cost": cmp = costOf(a) - costOf(b); break;
        case "diff": cmp = diffOf(a) - diffOf(b); break;
      }
      return sort.asc ? cmp : -cmp;
    });
    return list;
  }, [data, mode, sort, currentCost]);

  const filtered = useMemo(() => {
    if (providerFilter === "all") return sorted;
    return sorted.filter((d) => d.provider === providerFilter);
  }, [sorted, providerFilter]);

  function toggleSort(key: SortKey) {
    if (sort.key === key) onSortChange({ key, asc: !sort.asc });
    else onSortChange({ key, asc: true });
  }

  const indicator = (key: SortKey) => (sort.key === key ? (sort.asc ? " ↑" : " ↓") : "");

  const label = MODE_LABELS[mode];
  const showProvider = providerFilter === "all";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label.title}</CardTitle>
        <CardDescription>{label.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="pb-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort("model")}>Model{indicator("model")}</th>
                {showProvider && <th className="pb-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort("provider")}>Provider{indicator("provider")}</th>}
                <th className="pb-2 pr-4 font-medium text-right cursor-pointer" onClick={() => toggleSort("cost")}>Cost{indicator("cost")}</th>
                <th className="pb-2 font-medium text-right cursor-pointer" onClick={() => toggleSort("diff")}>vs Actual{indicator("diff")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const cost = costOf(row);
                const isCurrent = currentModels.some(
                  (m) => row.model.includes(m) || m.includes(row.model),
                );
                const diff = diffOf(row);
                return (
                  <tr
                    key={row.model}
                    className={`border-b last:border-0 ${isCurrent ? "bg-sky-50" : ""}`}
                  >
                    <td className="py-2 pr-4 font-medium">
                      {row.model}
                      {isCurrent && (
                        <span className="ml-1.5 text-[10px] font-semibold text-sky-700">
                          CURRENT
                        </span>
                      )}
                    </td>
                    {showProvider && <td className="py-2 pr-4 text-slate-500">{row.provider}</td>}
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(cost)}</td>
                    <td className={`py-2 text-right tabular-nums font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-slate-500"}`}>
                      {diff > 0 ? "+" : ""}
                      {diff.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
