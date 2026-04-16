import { useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useProjectorData } from "@/hooks/use-projector-data";
import { projectUsage } from "@/lib/projector-calc";
import { ProjectionTable, type SortState } from "@/components/projector/projection-table";
import { ProjectionChart } from "@/components/projector/projection-chart";
import { Button } from "@/components/ui/button";
import { ManualCalculator } from "@/components/projector/manual-calculator";
import { PriceReference } from "@/components/projector/price-reference";
import type { DateRange } from "@/lib/api";
import { ConnectionErrorDialog } from "@/components/connection-error-dialog";

const TREND_WINDOWS = ["7day", "14day", "30day", "90day", "all"] as const;
type TrendWindow = (typeof TREND_WINDOWS)[number];

function trendWindowToDateRange(window: TrendWindow): DateRange | undefined {
  if (window === "all") return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = fmt(today);
  const cutoff = new Date(today);
  const days = window === "7day" ? 7 : window === "14day" ? 14 : window === "30day" ? 30 : 90;
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return { from: fmt(cutoff), to };
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ProjectorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const trendWindow = (TREND_WINDOWS as readonly string[]).includes(searchParams.get("window") ?? "")
    ? (searchParams.get("window") as TrendWindow)
    : "30day";
  const setTrendWindow = useCallback((w: TrendWindow) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (w === "30day") next.delete("window");
      else next.set("window", w);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const dateRange = useMemo(() => trendWindowToDateRange(trendWindow), [trendWindow]);
  const { models, usage, loading, errors, initialLoad, refetch } = useProjectorData(dateRange);

  const [providerFilter, setProviderFilter] = useState("all");
  const [tableSort, setTableSort] = useState<SortState>({ key: "cost", asc: true });

  const projection = useMemo(() => {
    if (!models || !usage) return null;
    return projectUsage(models.models, usage.totals.with_cache, usage.totals.without_cache);
  }, [models, usage]);

  const providers = useMemo(() => {
    if (!projection) return [];
    const set = new Set(projection.map((d) => d.provider));
    return ["all", ...Array.from(set).sort()];
  }, [projection]);

  const currentModels = useMemo(() => {
    if (!usage) return [];
    return usage.by_model.map((m) => m.model);
  }, [usage]);

  const currentCost = useMemo(() => {
    if (!usage) return 0;
    return usage.by_model.reduce((sum, m) => sum + m.equivalent_api_cost, 0);
  }, [usage]);

  if (initialLoad) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Cost Projector
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Project your usage onto other models' pricing.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            ← Dashboard
          </Link>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trend Window</p>
            <div className="flex flex-wrap gap-1.5">
              {TREND_WINDOWS.map((w) => (
                <Button
                  key={w}
                  type="button"
                  size="xs"
                  variant={trendWindow === w ? "default" : "outline"}
                  className={trendWindow === w ? "bg-slate-950 text-white hover:bg-slate-900" : "bg-white"}
                  onClick={() => setTrendWindow(w)}
                >
                  {w === "all" ? "All" : w.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
          {providers.length > 2 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Provider</p>
              <div className="flex flex-wrap gap-1.5">
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
            </div>
          )}
        </div>

        {/* Historical Projection */}
        {projection && (
          <section className="space-y-4">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                Historical Projection
              </p>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                What if you used a different model?
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ProjectionTable
                data={projection}
                mode="with_cache"
                providerFilter={providerFilter}
                sort={tableSort}
                onSortChange={setTableSort}
                currentModels={currentModels}
                currentCost={currentCost}
              />
              <ProjectionTable
                data={projection}
                mode="without_cache"
                providerFilter={providerFilter}
                sort={tableSort}
                onSortChange={setTableSort}
                currentModels={currentModels}
                currentCost={currentCost}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ProjectionChart data={projection} mode="with_cache" providerFilter={providerFilter} />
              <ProjectionChart data={projection} mode="without_cache" providerFilter={providerFilter} />
            </div>
          </section>
        )}

        {models && (
          <ManualCalculator models={models.models} providerFilter={providerFilter} />
        )}

        {models && (
          <PriceReference models={models.models} />
        )}
      </div>
      <ConnectionErrorDialog errors={errors} onRetry={refetch} retrying={loading} />
    </div>
  );
}
