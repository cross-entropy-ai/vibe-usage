import { CostSummaryCard } from "@/components/cost-summary-card";
import { CostByToolCard } from "@/components/cost-by-tool-card";
import { DailyCostChart } from "@/components/daily-cost-chart";
import { CostByModelChart } from "@/components/cost-by-model-chart";
import type { CostData } from "@/types";

export function CostOverview({ data }: { data: CostData }) {
  return (
    <div className="space-y-4">
      <CostSummaryCard data={data} />
      <CostByToolCard data={data} />
      <div className="grid gap-4 md:grid-cols-2">
        <DailyCostChart data={data.daily} />
        <CostByModelChart data={data.by_model} />
      </div>
    </div>
  );
}
