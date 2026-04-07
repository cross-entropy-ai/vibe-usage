import { usePerformance } from "@/lib/contexts";
import { LatencyChart } from "@/components/latency-chart";

export function PerformanceSection() {
  const latency = usePerformance();
  if (!latency) return null;

  return <LatencyChart data={latency} />;
}
