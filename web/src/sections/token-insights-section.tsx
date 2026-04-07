import { useToken } from "@/lib/contexts";
import { TokenTrendChart } from "@/components/token-trend-chart";
import { CacheEfficiency } from "@/components/cache-efficiency";
import { ThinkingRatio } from "@/components/thinking-ratio";

export function TokenInsightsSection() {
  const token = useToken();

  return (
    <>
      {token?.tokensDaily && <TokenTrendChart data={token.tokensDaily} />}
      {token?.cacheEfficiency && <CacheEfficiency data={token.cacheEfficiency} />}
      {token?.thinking && token.thinking.length > 0 && <ThinkingRatio data={token.thinking} />}
    </>
  );
}
