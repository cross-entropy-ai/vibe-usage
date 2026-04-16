import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useProjectorData } from "@/hooks/use-projector-data";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { projectUsage } from "@/lib/projector-calc";
import { ProjectionTable } from "@/components/projector/projection-table";
import { ProjectionChart } from "@/components/projector/projection-chart";
import { Button } from "@/components/ui/button";
import { ManualCalculator } from "@/components/projector/manual-calculator";
import type { DateRange } from "@/lib/api";

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
  const [trendWindow, setTrendWindow] = useSearchParamState<TrendWindow>("window", "30day", TREND_WINDOWS);
  const dateRange = useMemo(() => trendWindowToDateRange(trendWindow), [trendWindow]);
  const { models, usage, loading, errors, initialLoad } = useProjectorData(dateRange);

  const projection = useMemo(() => {
    if (!models || !usage) return null;
    return projectUsage(models.models, usage.totals.with_cache, usage.totals.without_cache);
  }, [models, usage]);

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
              Usage Projector
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

        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {errors.join("; ")}
          </div>
        )}

        {/* Period selector */}
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
                currentModels={currentModels}
                currentCost={currentCost}
              />
              <ProjectionChart
                data={projection}
                currentModels={currentModels}
              />
            </div>
          </section>
        )}

        {models && (
          <ManualCalculator models={models.models} />
        )}
      </div>
    </div>
  );
}
