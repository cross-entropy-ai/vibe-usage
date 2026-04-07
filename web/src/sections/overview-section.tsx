import { useSummary } from "@/lib/contexts";
import { StatsCards } from "@/components/stats-cards";
import { EfficiencyCards } from "@/components/efficiency-cards";
import { TrendComparison } from "@/components/trend-comparison";
import { EfficiencyTrendChart } from "@/components/efficiency-trend-chart";

export function OverviewSection() {
  const summary = useSummary();
  if (!summary) return null;

  return (
    <>
      <StatsCards summary={summary} />
      <EfficiencyCards summary={summary} />
      <TrendComparison daily={summary.daily} />
      <EfficiencyTrendChart daily={summary.daily} />
    </>
  );
}
