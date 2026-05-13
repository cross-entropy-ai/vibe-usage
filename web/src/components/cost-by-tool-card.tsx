import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toolColor } from "@/lib/utils";
import { fmtUsd } from "@/lib/formatters";
import { useChartScale } from "@/lib/contexts";
import { ChartScaleToggle } from "./chart-scale-toggle";
import type { CostData } from "@/types";

export function CostByToolCard({ data }: { data: CostData }) {
  const { scale, isLog, toggle } = useChartScale();
  const toolEntries = Object.entries(data.by_tool).sort(
    (a, b) => b[1].equivalent_api_cost_usd - a[1].equivalent_api_cost_usd,
  );
  const total = data.equivalent_api_cost_usd;

  function widthPct(value: number): number {
    if (total <= 0) return 0;
    if (isLog) {
      const logTotal = Math.log(1 + total);
      if (logTotal <= 0) return 0;
      return (Math.log(1 + value) / logTotal) * 100;
    }
    return (value / total) * 100;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost by Tool</CardTitle>
        <CardDescription>Equivalent API cost vs actual (with subscription)</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {toolEntries.map(([tool, info]) => {
            const pct = widthPct(info.equivalent_api_cost_usd);
            return (
              <div key={tool} className="flex items-center gap-3">
                <Badge variant="secondary" className={`${toolColor(tool)} w-16 justify-center`}>
                  {tool}
                </Badge>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{fmtUsd(info.equivalent_api_cost_usd)}</span>
                    {info.subscription && (
                      <span className="text-xs text-muted-foreground">
                        actual: {fmtUsd(info.actual_cost_usd)} ({info.subscription.plan})
                        {info.saved_usd > 0 && (
                          <span className="text-green-600 ml-1">
                            saved {fmtUsd(info.saved_usd)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.max(pct, info.equivalent_api_cost_usd > 0 ? 1 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
