import { CostByToolCard } from "@/components/cost-by-tool-card";
import { CostByModelChart } from "@/components/cost-by-model-chart";
import type { CostData } from "@/types";

export function CostOverview({ data }: { data: CostData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CostByToolCard data={data} />
      <CostByModelChart data={data.by_model} />
    </div>
  );
}
