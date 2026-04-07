# Split DashboardContext Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `DashboardContext` (20 nullable fields) with 7 domain-specific contexts to eliminate unnecessary re-renders and improve SRP.

**Architecture:** Keep `fetchDashboardData()` unchanged. Add a `lib/contexts/` directory with 7 context files, a compose helper, and a barrel export. Refactor `App.tsx` to distribute fetched data into domain providers. Update 7 section files to use domain-specific hooks.

**Tech Stack:** React 19, TypeScript 6, Vite 8

**Verify commands:** `cd /Users/junyi/claude/vibe-usage/web && npx tsc --noEmit && npx vite build`

---

### Task 1: Create context type definitions

**Files:**
- Create: `web/src/lib/contexts/types.ts`

- [ ] **Step 1: Create `types.ts` with compound value types**

For contexts that bundle multiple fields, define typed interfaces. Contexts wrapping a single existing type (Summary, CostData, LatencyData) don't need new types.

```ts
import type {
  LanguagesData,
  WeekdayHeatmapEntry,
  SessionComplexityEntry,
  ConversationsInsight,
  TokensDailyEntry,
  CacheEfficiencyData,
  ThinkingEntry,
  DurationData,
  ModelTokens,
  ToolCallFreq,
  ToolStatusEntry,
  ToolchainsData,
  ModelSwitchData,
  ProjectDetail,
  HostStat,
  GitRepoStat,
  DirectoryStat,
} from "@/types";

export interface ActivityContextValue {
  languages: LanguagesData | null;
  weekday: WeekdayHeatmapEntry[] | null;
  sessionComplexity: SessionComplexityEntry[] | null;
  conversations: ConversationsInsight | null;
}

export interface TokenContextValue {
  tokensDaily: TokensDailyEntry[] | null;
  cacheEfficiency: CacheEfficiencyData | null;
  thinking: ThinkingEntry[] | null;
}

export interface ModelsToolsContextValue {
  duration: DurationData | null;
  models: ModelTokens[] | null;
  toolCalls: ToolCallFreq[] | null;
  toolStatus: ToolStatusEntry[] | null;
  toolchains: ToolchainsData | null;
  modelSwitches: ModelSwitchData | null;
}

export interface TablesContextValue {
  projects: ProjectDetail[] | null;
  hosts: HostStat[] | null;
  gitActivity: GitRepoStat[] | null;
  directories: DirectoryStat[] | null;
}
```

---

### Task 2: Create the 7 context files

**Files:**
- Create: `web/src/lib/contexts/summary-context.tsx`
- Create: `web/src/lib/contexts/cost-context.tsx`
- Create: `web/src/lib/contexts/activity-context.tsx`
- Create: `web/src/lib/contexts/token-context.tsx`
- Create: `web/src/lib/contexts/models-tools-context.tsx`
- Create: `web/src/lib/contexts/performance-context.tsx`
- Create: `web/src/lib/contexts/tables-context.tsx`

All 7 files follow the same pattern. Here is each one in full.

- [ ] **Step 1: Create `summary-context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { Summary } from "@/types";

const SummaryContext = createContext<Summary | null>(null);

export function SummaryProvider({ value, children }: { value: Summary | null; children: ReactNode }) {
  return <SummaryContext.Provider value={value}>{children}</SummaryContext.Provider>;
}

export function useSummary(): Summary | null {
  return useContext(SummaryContext);
}
```

- [ ] **Step 2: Create `cost-context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { CostData } from "@/types";

const CostContext = createContext<CostData | null>(null);

export function CostProvider({ value, children }: { value: CostData | null; children: ReactNode }) {
  return <CostContext.Provider value={value}>{children}</CostContext.Provider>;
}

export function useCost(): CostData | null {
  return useContext(CostContext);
}
```

- [ ] **Step 3: Create `activity-context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { ActivityContextValue } from "./types";

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ value, children }: { value: ActivityContextValue | null; children: ReactNode }) {
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity(): ActivityContextValue | null {
  return useContext(ActivityContext);
}
```

- [ ] **Step 4: Create `token-context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { TokenContextValue } from "./types";

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({ value, children }: { value: TokenContextValue | null; children: ReactNode }) {
  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue | null {
  return useContext(TokenContext);
}
```

- [ ] **Step 5: Create `models-tools-context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { ModelsToolsContextValue } from "./types";

const ModelsToolsContext = createContext<ModelsToolsContextValue | null>(null);

export function ModelsToolsProvider({ value, children }: { value: ModelsToolsContextValue | null; children: ReactNode }) {
  return <ModelsToolsContext.Provider value={value}>{children}</ModelsToolsContext.Provider>;
}

export function useModelsTools(): ModelsToolsContextValue | null {
  return useContext(ModelsToolsContext);
}
```

- [ ] **Step 6: Create `performance-context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { LatencyData } from "@/types";

const PerformanceContext = createContext<LatencyData | null>(null);

export function PerformanceProvider({ value, children }: { value: LatencyData | null; children: ReactNode }) {
  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
}

export function usePerformance(): LatencyData | null {
  return useContext(PerformanceContext);
}
```

- [ ] **Step 7: Create `tables-context.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from "react";
import type { TablesContextValue } from "./types";

const TablesContext = createContext<TablesContextValue | null>(null);

export function TablesProvider({ value, children }: { value: TablesContextValue | null; children: ReactNode }) {
  return <TablesContext.Provider value={value}>{children}</TablesContext.Provider>;
}

export function useTables(): TablesContextValue | null {
  return useContext(TablesContext);
}
```

---

### Task 3: Create compose helper and barrel export

**Files:**
- Create: `web/src/lib/contexts/compose.tsx`
- Create: `web/src/lib/contexts/index.ts`

- [ ] **Step 1: Create `compose.tsx`**

```tsx
import type { ReactNode } from "react";

type ProviderEntry<V = unknown> = [
  React.ComponentType<{ value: V; children: ReactNode }>,
  V,
];

export function composeProviders(providers: ProviderEntry[], children: ReactNode): ReactNode {
  return providers.reduceRight<ReactNode>(
    (acc, [Provider, value]) => <Provider value={value}>{acc}</Provider>,
    children,
  );
}
```

- [ ] **Step 2: Create `index.ts` barrel export**

```ts
export { SummaryProvider, useSummary } from "./summary-context";
export { CostProvider, useCost } from "./cost-context";
export { ActivityProvider, useActivity } from "./activity-context";
export { TokenProvider, useToken } from "./token-context";
export { ModelsToolsProvider, useModelsTools } from "./models-tools-context";
export { PerformanceProvider, usePerformance } from "./performance-context";
export { TablesProvider, useTables } from "./tables-context";
export { composeProviders } from "./compose";
export type {
  ActivityContextValue,
  TokenContextValue,
  ModelsToolsContextValue,
  TablesContextValue,
} from "./types";
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/junyi/claude/vibe-usage/web && npx tsc --noEmit`
Expected: no errors (new files are unused so far, but must be type-correct)

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/contexts/
git commit -m "feat: add domain-specific context providers and compose helper"
```

---

### Task 4: Rewrite App.tsx to use domain providers

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Rewrite `App.tsx`**

Replace the entire file with:

```tsx
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
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/junyi/claude/vibe-usage/web && npx tsc --noEmit`
Expected: errors in section files (they still import the old `useDashboard`) — that's correct, we fix sections in next tasks.

---

### Task 5: Update section files to use domain hooks

**Files:**
- Modify: `web/src/sections/overview-section.tsx`
- Modify: `web/src/sections/cost-section.tsx`
- Modify: `web/src/sections/activity-section.tsx`
- Modify: `web/src/sections/token-insights-section.tsx`
- Modify: `web/src/sections/models-tools-section.tsx`
- Modify: `web/src/sections/performance-section.tsx`
- Modify: `web/src/sections/tables-section.tsx`

- [ ] **Step 1: Update `overview-section.tsx`**

```tsx
import { useSummary } from "@/lib/contexts";
import { StatsCards } from "@/components/stats-cards";
import { EfficiencyCards } from "@/components/efficiency-cards";
import { TrendComparison } from "@/components/trend-comparison";
import { EfficiencyTrendChart } from "@/components/efficiency-trend-chart";

export function OverviewSection() {
  const summary = useSummary();
  if (!summary) return null;

  return (
    <>
      <StatsCards summary={summary} />
      <EfficiencyCards summary={summary} />
      <TrendComparison daily={summary.daily} />
      <EfficiencyTrendChart daily={summary.daily} />
    </>
  );
}
```

- [ ] **Step 2: Update `cost-section.tsx`**

```tsx
import { useSummary } from "@/lib/contexts";
import { useCost } from "@/lib/contexts";
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
```

- [ ] **Step 3: Update `activity-section.tsx`**

```tsx
import { useSummary } from "@/lib/contexts";
import { useActivity } from "@/lib/contexts";
import { Languages } from "@/components/languages";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { WeekdayHeatmap } from "@/components/weekday-heatmap";
import { SessionComplexity } from "@/components/session-complexity";
import { ConversationDepth } from "@/components/conversation-depth";

export function ActivitySection() {
  const summary = useSummary();
  const activity = useActivity();

  return (
    <>
      {activity?.languages && <Languages data={activity.languages} />}
      {summary && <ActivityHeatmap daily={summary.daily} />}
      {activity?.weekday && <WeekdayHeatmap data={activity.weekday} />}
      {activity?.sessionComplexity && <SessionComplexity data={activity.sessionComplexity} />}
      {activity?.conversations && <ConversationDepth data={activity.conversations} />}
    </>
  );
}
```

- [ ] **Step 4: Update `token-insights-section.tsx`**

```tsx
import { useSummary } from "@/lib/contexts";
import { useToken } from "@/lib/contexts";
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
```

- [ ] **Step 5: Update `models-tools-section.tsx`**

```tsx
import { useModelsTools } from "@/lib/contexts";
import { DurationChart } from "@/components/duration-chart";
import { ModelsChart } from "@/components/models-chart";
import { ToolCallsChart } from "@/components/tool-calls-chart";
import { ToolStatusChart } from "@/components/tool-status-chart";
import { Toolchains } from "@/components/toolchains";
import { ModelSwitches } from "@/components/model-switches";

export function ModelsToolsSection() {
  const mt = useModelsTools();

  return (
    <>
      {(mt?.duration || mt?.models) && (
        <div className="grid gap-4 md:grid-cols-2">
          {mt?.duration && <DurationChart data={mt.duration} />}
          {mt?.models && <ModelsChart data={mt.models} />}
        </div>
      )}
      {(mt?.toolCalls || mt?.toolStatus) && (
        <div className="grid gap-4 md:grid-cols-2">
          {mt?.toolCalls && <ToolCallsChart data={mt.toolCalls} />}
          {mt?.toolStatus && <ToolStatusChart data={mt.toolStatus} />}
        </div>
      )}
      {mt?.toolchains && <Toolchains data={mt.toolchains} />}
      {mt?.modelSwitches && <ModelSwitches data={mt.modelSwitches} />}
    </>
  );
}
```

- [ ] **Step 6: Update `performance-section.tsx`**

```tsx
import { usePerformance } from "@/lib/contexts";
import { LatencyChart } from "@/components/latency-chart";

export function PerformanceSection() {
  const latency = usePerformance();
  if (!latency) return null;

  return <LatencyChart data={latency} />;
}
```

- [ ] **Step 7: Update `tables-section.tsx`**

```tsx
import { useTables } from "@/lib/contexts";
import { ProjectsTable } from "@/components/projects-table";
import { HostsTable } from "@/components/hosts-table";
import { GitActivity } from "@/components/git-activity";
import { DirectoryChart } from "@/components/directory-chart";

export function TablesSection() {
  const tables = useTables();

  return (
    <>
      {tables?.projects && <ProjectsTable data={tables.projects} />}
      {tables?.hosts && <HostsTable data={tables.hosts} />}
      {tables?.gitActivity && tables.gitActivity.length > 0 && <GitActivity data={tables.gitActivity} />}
      {tables?.directories && tables.directories.length > 0 && <DirectoryChart data={tables.directories} />}
    </>
  );
}
```

- [ ] **Step 8: Verify types compile**

Run: `cd /Users/junyi/claude/vibe-usage/web && npx tsc --noEmit`
Expected: PASS — no errors

- [ ] **Step 9: Verify build**

Run: `cd /Users/junyi/claude/vibe-usage/web && npx vite build`
Expected: build succeeds

- [ ] **Step 10: Commit**

```bash
git add web/src/App.tsx web/src/sections/
git commit -m "refactor: replace DashboardContext with 7 domain-specific contexts"
```

---

### Task 6: Delete old dashboard-context.tsx

**Files:**
- Delete: `web/src/lib/dashboard-context.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm web/src/lib/dashboard-context.tsx
```

- [ ] **Step 2: Verify no remaining imports**

Search for any leftover references:

```bash
grep -r "dashboard-context" web/src/
```

Expected: no matches

- [ ] **Step 3: Verify build**

Run: `cd /Users/junyi/claude/vibe-usage/web && npx tsc --noEmit && npx vite build`
Expected: both pass

- [ ] **Step 4: Commit**

```bash
git rm web/src/lib/dashboard-context.tsx
git commit -m "chore: remove old monolithic DashboardContext"
```
