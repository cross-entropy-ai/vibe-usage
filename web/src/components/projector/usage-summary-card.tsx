import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmtUsd, fmtNum } from "@/lib/formatters";
import type { UsageSummary } from "@/types/projector";

interface Props {
  usage: UsageSummary;
}

export function UsageSummaryCard({ usage }: Props) {
  const totalSessions = usage.by_model.reduce((sum, m) => sum + m.sessions, 0);
  const totalCost = usage.by_model.reduce((sum, m) => sum + m.equivalent_api_cost, 0);
  const t = usage.totals.with_cache;
  const totalTokens = t.input_tokens + t.output_tokens + t.thinking_tokens + t.cache_read_tokens + t.cache_write_tokens;

  const period = usage.period.from && usage.period.to
    ? `${usage.period.from} — ${usage.period.to}`
    : "All time";

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
          Current Usage
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          Your actual usage in this period
        </h2>
        <p className="text-[13px] text-slate-500">{period}</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Equivalent API Cost" value={fmtUsd(totalCost)} />
        <StatCard label="Total Tokens" value={fmtNum(totalTokens)} />
        <StatCard label="Sessions" value={fmtNum(totalSessions)} />
        <StatCard label="Models Used" value={String(usage.by_model.length)} />
      </div>

      {/* Per-model breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage by Model</CardTitle>
          <CardDescription>Token breakdown per model in selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Model</th>
                  <th className="pb-2 pr-4 font-medium">Tool</th>
                  <th className="pb-2 pr-4 font-medium text-right">Sessions</th>
                  <th className="pb-2 pr-4 font-medium text-right">Input</th>
                  <th className="pb-2 pr-4 font-medium text-right">Output</th>
                  <th className="pb-2 pr-4 font-medium text-right">Thinking</th>
                  <th className="pb-2 pr-4 font-medium text-right">Cache Read</th>
                  <th className="pb-2 pr-4 font-medium text-right">Cache Write</th>
                  <th className="pb-2 font-medium text-right">API Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.by_model.map((m) => (
                  <tr key={`${m.model}-${m.tool}`} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{m.model}</td>
                    <td className="py-2 pr-4 text-slate-500">{m.tool}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(m.sessions)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(m.input_tokens)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(m.output_tokens)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(m.thinking_tokens)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(m.cache_read_tokens)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(m.cache_write_tokens)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{fmtUsd(m.equivalent_api_cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="pt-2 pr-4" colSpan={2}>Total</td>
                  <td className="pt-2 pr-4 text-right tabular-nums">{fmtNum(totalSessions)}</td>
                  <td className="pt-2 pr-4 text-right tabular-nums">{fmtNum(t.input_tokens)}</td>
                  <td className="pt-2 pr-4 text-right tabular-nums">{fmtNum(t.output_tokens)}</td>
                  <td className="pt-2 pr-4 text-right tabular-nums">{fmtNum(t.thinking_tokens)}</td>
                  <td className="pt-2 pr-4 text-right tabular-nums">{fmtNum(t.cache_read_tokens)}</td>
                  <td className="pt-2 pr-4 text-right tabular-nums">{fmtNum(t.cache_write_tokens)}</td>
                  <td className="pt-2 text-right tabular-nums">{fmtUsd(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
    </div>
  );
}
