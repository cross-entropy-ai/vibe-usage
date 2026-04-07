import { SessionsAreaChart } from "./sessions-area-chart";
import { TokenBarChart } from "./token-bar-chart";
import { CumulativeSessionsChart } from "./cumulative-sessions-chart";
import { ToolPieChart } from "./tool-pie-chart";
import { TokenRadarChart } from "./token-radar-chart";
import { MessageRadialChart } from "./message-radial-chart";
import type { Summary } from "@/types";

export function UsageCharts({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <SessionsAreaChart daily={summary.daily} />
      <TokenBarChart daily={summary.daily} />
      <CumulativeSessionsChart daily={summary.daily} />
      <ToolPieChart byTool={summary.by_tool} totalSessions={summary.total_sessions} />
      <TokenRadarChart tokens={summary.tokens} />
      <MessageRadialChart messages={summary.messages} />
    </div>
  );
}
