import { useSummary, useToken } from "@/lib/contexts";
import { TokenTrendChart } from "@/components/token-trend-chart";
import { CacheEfficiency } from "@/components/cache-efficiency";
import { ThinkingRatio } from "@/components/thinking-ratio";
import { UsageCharts } from "@/components/usage-chart";

export function TokenInsightsSection() {
  const summary = useSummary();
  const token = useToken();

  return (
    <>
      {token?.tokensDaily && <TokenTrendChart data={token.tokensDaily} />}
      {token?.cacheEfficiency && <CacheEfficiency data={token.cacheEfficiency} />}
      {token?.thinking && token.thinking.length > 0 && <ThinkingRatio data={token.thinking} />}
      {summary && <UsageCharts summary={summary} />}
    </>
  );
}
