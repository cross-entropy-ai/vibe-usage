import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { projectUsage, manualTokens } from "@/lib/projector-calc";
import { ProjectionTable, type SortState } from "./projection-table";
import { ProjectionChart } from "./projection-chart";
import type { ProjectorModel } from "@/types/projector";

function TokenInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="number"
        min={0}
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="0"
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
    </div>
  );
}

interface Props {
  models: ProjectorModel[];
  providerFilter: string;
}

export function ManualCalculator({ models, providerFilter }: Props) {
  const [calcSort, setCalcSort] = useState<SortState>({ key: "cost", asc: true });
  const [input, setInput] = useState(0);
  const [output, setOutput] = useState(0);
  const [thinking, setThinking] = useState(0);
  const [cacheRead, setCacheRead] = useState(0);
  const [cacheWrite, setCacheWrite] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const projection = useMemo(() => {
    const total = input + output + thinking + cacheRead + cacheWrite;
    if (total === 0) return null;
    const { withCache, withoutCache } = manualTokens(input, output, thinking, cacheRead, cacheWrite);
    return projectUsage(models, withCache, withoutCache);
  }, [models, input, output, thinking, cacheRead, cacheWrite]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
          Calculator
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          Manual Cost Estimator
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token Input</CardTitle>
          <CardDescription>Enter token counts to see projected costs across models</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TokenInput label="Input Tokens" value={input} onChange={setInput} />
            <TokenInput label="Output Tokens" value={output} onChange={setOutput} />
          </div>

          {showAdvanced && (
            <div className="grid gap-4 sm:grid-cols-3">
              <TokenInput label="Thinking Tokens" value={thinking} onChange={setThinking} />
              <TokenInput label="Cache Read Tokens" value={cacheRead} onChange={setCacheRead} />
              <TokenInput label="Cache Write Tokens" value={cacheWrite} onChange={setCacheWrite} />
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-500"
          >
            {showAdvanced ? "Hide Advanced" : "Advanced"}
          </Button>
        </CardContent>
      </Card>

      {projection && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectionTable data={projection} mode="with_cache" providerFilter={providerFilter} sort={calcSort} onSortChange={setCalcSort} currentModels={[]} currentCost={0} />
            <ProjectionTable data={projection} mode="without_cache" providerFilter={providerFilter} sort={calcSort} onSortChange={setCalcSort} currentModels={[]} currentCost={0} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectionChart data={projection} mode="with_cache" providerFilter={providerFilter} />
            <ProjectionChart data={projection} mode="without_cache" providerFilter={providerFilter} />
          </div>
        </>
      )}
    </section>
  );
}
