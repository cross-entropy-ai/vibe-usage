import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtUsd } from "@/lib/formatters";
import type { ProjectionResult } from "@/lib/projector-calc";

interface Props {
  data: ProjectionResult[];
  currentModels: string[];
  currentCost: number;
}

export function ProjectionTable({ data, currentModels, currentCost }: Props) {
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const providers = useMemo(() => {
    const set = new Set(data.map((d) => d.provider));
    return ["all", ...Array.from(set).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    if (providerFilter === "all") return data;
    return data.filter((d) => d.provider === providerFilter);
  }, [data, providerFilter]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Model Cost Comparison</CardTitle>
        <CardDescription>Projected cost if you used each model</CardDescription>
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
                <th className="pb-2 pr-4 font-medium text-right">With Cache</th>
                <th className="pb-2 pr-4 font-medium text-right">No Cache</th>
                <th className="pb-2 font-medium text-right">vs Actual</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isCurrent = currentModels.some(
                  (m) => row.model.includes(m) || m.includes(row.model),
                );
                const diff =
                  currentCost > 0
                    ? ((row.cost_without_cache - currentCost) / currentCost) * 100
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
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(row.cost_with_cache)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(row.cost_without_cache)}</td>
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
