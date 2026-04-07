import { useSummary, useCost } from "@/lib/contexts";
import { CumulativeChart } from "@/components/cumulative-chart";
import { CostOverview } from "@/components/cost-overview";
import { TokenFlowChart } from "@/components/token-flow-chart";

export function CostSection() {
  const summary = useSummary();
  const cost = useCost();

  return (
    <>
      {summary && cost && (
        <CumulativeChart daily={summary.daily} costDaily={cost.daily} />
      )}
      {cost && <CostOverview data={cost} />}
      {cost && <TokenFlowChart data={cost.by_model} />}
    </>
  );
}
