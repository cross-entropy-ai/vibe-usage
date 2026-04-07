import { useSummary } from "@/lib/contexts";
import { SessionsAreaChart } from "@/components/sessions-area-chart";
import { TokenBarChart } from "@/components/token-bar-chart";
import { CumulativeSessionsChart } from "@/components/cumulative-sessions-chart";
import { StatsCards } from "@/components/stats-cards";
import { EfficiencyCards } from "@/components/efficiency-cards";
import { TrendComparison } from "@/components/trend-comparison";
import { EfficiencyTrendChart } from "@/components/efficiency-trend-chart";

export function OverviewSection() {
  const summary = useSummary();
  if (!summary) return null;

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-3">
        <SessionsAreaChart daily={summary.daily} />
        <TokenBarChart daily={summary.daily} />
        <CumulativeSessionsChart daily={summary.daily} />
      </div>
      <StatsCards summary={summary} />
      <EfficiencyCards summary={summary} />
      <TrendComparison daily={summary.daily} />
      <EfficiencyTrendChart daily={summary.daily} />
    </>
  );
}
