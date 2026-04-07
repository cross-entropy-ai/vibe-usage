import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtUsd } from "@/lib/formatters";
import type { CostData } from "@/types";

export function CostSummaryCard({ data }: { data: CostData }) {
  const savingsPct =
    data.equivalent_api_cost_usd > 0
      ? ((data.saved_usd / data.equivalent_api_cost_usd) * 100).toFixed(0)
      : "0";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cost</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-x-8 gap-y-2 items-baseline">
          <div>
            <span className="text-xs text-muted-foreground mr-1">API Equivalent</span>
            <span className="text-xl font-bold">{fmtUsd(data.equivalent_api_cost_usd)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground mr-1">Actual</span>
            <span className="text-xl font-bold">{fmtUsd(data.actual_cost_usd)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground mr-1">Saved</span>
            <span className="text-xl font-bold text-green-600">{fmtUsd(data.saved_usd)}</span>
            <span className="text-xs text-green-600 ml-1">({savingsPct}%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
