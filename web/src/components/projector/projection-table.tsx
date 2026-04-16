import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtUsd } from "@/lib/formatters";
import type { ProjectionResult } from "@/lib/projector-calc";

export type CostMode = "with_cache" | "without_cache";

interface Props {
  data: ProjectionResult[];
  mode: CostMode;
  currentModels: string[];
  currentCost: number;
}

const MODE_LABELS: Record<CostMode, { title: string; description: string }> = {
  with_cache: { title: "With Cache", description: "Projected cost preserving your cache hit ratio" },
  without_cache: { title: "Without Cache", description: "Projected cost treating all tokens as raw input/output" },
};

export function ProjectionTable({ data, mode, currentModels, currentCost }: Props) {
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const providers = useMemo(() => {
    const set = new Set(data.map((d) => d.provider));
    return ["all", ...Array.from(set).sort()];
  }, [data]);

  const sorted = useMemo(() => {
    const list = [...data];
    list.sort((a, b) => {
      const costA = mode === "with_cache" ? a.cost_with_cache : a.cost_without_cache;
      const costB = mode === "with_cache" ? b.cost_with_cache : b.cost_without_cache;
      return costA - costB;
    });
    return list;
  }, [data, mode]);

  const filtered = useMemo(() => {
    if (providerFilter === "all") return sorted;
    return sorted.filter((d) => d.provider === providerFilter);
  }, [sorted, providerFilter]);

  const label = MODE_LABELS[mode];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label.title}</CardTitle>
        <CardDescription>{label.description}</CardDescription>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {providers.map((p) => (
            <Button
              key={p}
              type="button"
              size="xs"
              variant={providerFilter === p ? "default" : "outline"}
              className={providerFilter === p ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
              onClick={() => setProviderFilter(p)}
            >
              {p === "all" ? "All" : p}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="pb-2 pr-4 font-medium">Model</th>
                <th className="pb-2 pr-4 font-medium">Provider</th>
                <th className="pb-2 pr-4 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">vs Actual</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const cost = mode === "with_cache" ? row.cost_with_cache : row.cost_without_cache;
                const isCurrent = currentModels.some(
                  (m) => row.model.includes(m) || m.includes(row.model),
                );
                const diff =
                  currentCost > 0
                    ? ((cost - currentCost) / currentCost) * 100
                    : 0;
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
                    <td className="py-2 pr-4 text-slate-500">{row.provider}</td>
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
