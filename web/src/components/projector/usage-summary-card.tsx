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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Equivalent API Cost" value={fmtUsd(totalCost)} />
        <StatCard label="Total Tokens" value={fmtNum(totalTokens)} />
        <StatCard label="Sessions" value={fmtNum(totalSessions)} />
        <StatCard label="Models Used" value={String(usage.by_model.length)} />
      </div>
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
