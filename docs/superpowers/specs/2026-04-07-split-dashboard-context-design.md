# Split DashboardContext into Domain-Specific Contexts

## Problem

The frontend uses a single `DashboardContext` carrying 20 nullable fields. All 7 sections subscribe to this one context, so any field change triggers re-renders across the entire dashboard. The monolithic `DashboardData` interface also means adding a new API endpoint touches 4+ files.

## Decision

Split into 7 domain-specific contexts. Keep the single parallel fetch (`fetchDashboardData`) unchanged — only the context/provider layer changes.

## Context Grouping

| Context | Type | Fields | Section consumers |
|---------|------|--------|-------------------|
| `SummaryContext` | `Summary \| null` | summary | Overview, Cost, Activity, TokenInsights |
| `CostContext` | `CostData \| null` | cost | Cost |
| `ActivityContext` | `ActivityContextValue \| null` | languages, weekday, sessionComplexity, conversations | Activity |
| `TokenContext` | `TokenContextValue \| null` | tokensDaily, cacheEfficiency, thinking | TokenInsights |
| `ModelsToolsContext` | `ModelsToolsContextValue \| null` | duration, models, toolCalls, toolStatus, toolchains, modelSwitches | ModelsTools |
| `PerformanceContext` | `LatencyData \| null` | latency | Performance |
| `TablesContext` | `TablesContextValue \| null` | projects, hosts, gitActivity, directories | Tables |

## File Structure

```
lib/
  contexts/
    types.ts                  # Compound value types (ActivityContextValue, etc.)
    summary-context.tsx
    cost-context.tsx
    activity-context.tsx
    token-context.tsx
    models-tools-context.tsx
    performance-context.tsx
    tables-context.tsx
    compose.tsx               # composeProviders helper
    index.ts                  # Re-exports all useXxx hooks
  api.ts                      # Unchanged
  formatters.ts               # Unchanged
  tools.ts                    # Unchanged
  utils.ts                    # Unchanged
```

`dashboard-context.tsx` is deleted.

## Provider Pattern

Each context file follows the same structure:

```tsx
const XxxContext = createContext<XxxValue | null>(null);

export function XxxProvider({ value, children }: { value: XxxValue | null; children: ReactNode }) {
  return <XxxContext.Provider value={value}>{children}</XxxContext.Provider>;
}

export function useXxx(): XxxValue | null {
  return useContext(XxxContext);
}
```

Providers always render children regardless of null value — sections handle null checks themselves (matching existing `{data.field && <Component />}` pattern).

## Provider Composition

A `composeProviders` helper avoids deep JSX nesting:

```tsx
type ProviderEntry = [React.ComponentType<{ value: any; children: ReactNode }>, any];

export function composeProviders(providers: ProviderEntry[], children: ReactNode): ReactNode {
  return providers.reduceRight(
    (acc, [Provider, value]) => <Provider value={value}>{acc}</Provider>,
    children,
  );
}
```

## App.tsx Changes

- Remove `DashboardProvider` wrapper
- Call `useDashboardData()` directly in `Dashboard` component
- Handle loading/fallback inline
- Distribute data fields to domain providers via `composeProviders`
- `ErrorBanner` receives `errors` as prop instead of reading from context

```tsx
function Dashboard() {
  const { data, errors, loading } = useDashboardData();

  if (loading || !data || Object.values(data).every(v => v === null)) {
    return <DashboardFallback loading={loading} errors={errors} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 space-y-6">
        {composeProviders([
          [SummaryProvider, data.summary],
          [CostProvider, data.cost],
          [ActivityProvider, { languages: data.languages, weekday: data.weekday, ... }],
          [TokenProvider, { tokensDaily: data.tokensDaily, ... }],
          [ModelsToolsProvider, { duration: data.duration, ... }],
          [PerformanceProvider, data.latency],
          [TablesProvider, { projects: data.projects, ... }],
        ], <>
          <ErrorBanner errors={errors} />
          <OverviewSection />
          <CostSection />
          <ActivitySection />
          <TokenInsightsSection />
          <ModelsToolsSection />
          <PerformanceSection />
          <TablesSection />
        </>)}
      </div>
    </div>
  );
}
```

## Section Changes

Minimal — replace `useDashboard()` with domain-specific hooks:

```tsx
// Before
const { data } = useDashboard();
if (!data.summary) return null;

// After
const summary = useSummary();
if (!summary) return null;
```

Sections that use multiple contexts (e.g., CostSection uses `useSummary()` + `useCost()`) call both hooks.

## ErrorBanner Change

Becomes a pure presentational component receiving `errors: string[]` as prop. No context dependency.

## What Does NOT Change

- `api.ts` — fetch logic, `DashboardData` interface, endpoint URLs
- `types.ts` — all type definitions
- `hooks/use-dashboard-data.ts` — data fetching hook
- All leaf components (charts, cards, tables) — they receive props, unaware of context
- `formatters.ts`, `tools.ts`, `utils.ts` — utility modules
