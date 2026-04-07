import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  SummaryProvider,
  CostProvider,
  ActivityProvider,
  TokenProvider,
  ModelsToolsProvider,
  PerformanceProvider,
  TablesProvider,
  composeProviders,
} from "@/lib/contexts";
import { OverviewSection } from "@/sections/overview-section";
import { CostSection } from "@/sections/cost-section";
import { ActivitySection } from "@/sections/activity-section";
import { TokenInsightsSection } from "@/sections/token-insights-section";
import { ModelsToolsSection } from "@/sections/models-tools-section";
import { PerformanceSection } from "@/sections/performance-section";
import { TablesSection } from "@/sections/tables-section";

function DashboardFallback({ loading, errors }: { loading: boolean; errors: string[] }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-2">
        <p className="text-destructive">Failed to load dashboard data</p>
        {errors.map((e, i) => (
          <p key={i} className="text-destructive text-sm">{e}</p>
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      Some data failed to load:{" "}
      {errors.map((e, i) => (
        <span key={i}>{i > 0 ? "; " : ""}{e}</span>
      ))}
    </div>
  );
}

function Dashboard() {
  const { data, errors, loading } = useDashboardData();

  if (loading || !data || Object.values(data).every((v) => v === null)) {
    return <DashboardFallback loading={loading} errors={errors} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage Stats</h1>
          <p className="text-muted-foreground text-sm">
            AI coding tool usage across Gemini, Claude, Codex, and Kimi
          </p>
        </div>
        {composeProviders(
          [
            [SummaryProvider, data.summary],
            [CostProvider, data.cost],
            [ActivityProvider, {
              languages: data.languages,
              weekday: data.weekday,
              sessionComplexity: data.sessionComplexity,
              conversations: data.conversations,
            }],
            [TokenProvider, {
              tokensDaily: data.tokensDaily,
              cacheEfficiency: data.cacheEfficiency,
              thinking: data.thinking,
            }],
            [ModelsToolsProvider, {
              duration: data.duration,
              models: data.models,
              toolCalls: data.toolCalls,
              toolStatus: data.toolStatus,
              toolchains: data.toolchains,
              modelSwitches: data.modelSwitches,
            }],
            [PerformanceProvider, data.latency],
            [TablesProvider, {
              projects: data.projects,
              hosts: data.hosts,
              gitActivity: data.gitActivity,
              directories: data.directories,
            }],
          ],
          <>
            <ErrorBanner errors={errors} />
            <OverviewSection />
            <CostSection />
            <ActivitySection />
            <TokenInsightsSection />
            <ModelsToolsSection />
            <PerformanceSection />
            <TablesSection />
          </>,
        )}
      </div>
    </div>
  );
}

export default function App() {
  return <Dashboard />;
}
