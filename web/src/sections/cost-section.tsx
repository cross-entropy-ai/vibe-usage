import { useSummary, useCost } from "@/lib/contexts";
import { CumulativeChart } from "@/components/cumulative-chart";
import { CostOverview } from "@/components/cost-overview";
import { DailyCostChart } from "@/components/daily-cost-chart";

export function CostSection() {
  const summary = useSummary();
  const cost = useCost();

  return (
    <>
      {summary && cost && (
        <div className="grid gap-4 md:grid-cols-2">
          <CumulativeChart daily={summary.daily} costDaily={cost.daily} />
          <DailyCostChart data={cost.daily} />
        </div>
      )}
      {cost && <CostOverview data={cost} />}
    </>
  );
}
