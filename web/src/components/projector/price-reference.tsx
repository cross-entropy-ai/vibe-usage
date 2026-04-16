import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ProjectorModel } from "@/types/projector";

function fmtPrice(perToken: number): string {
  const perMillion = perToken * 1_000_000;
  if (perMillion >= 1) return `$${perMillion.toFixed(2)}`;
  if (perMillion >= 0.01) return `$${perMillion.toFixed(4)}`;
  return `$${perMillion.toFixed(6)}`;
}

type SortKey = "name" | "provider" | "input" | "output" | "cache_read" | "cache_write";

interface Props {
  models: ProjectorModel[];
}

export function PriceReference({ models }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("input");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    );

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "provider": cmp = a.provider.localeCompare(b.provider); break;
        case "input": cmp = a.input_cost_per_token - b.input_cost_per_token; break;
        case "output": cmp = a.output_cost_per_token - b.output_cost_per_token; break;
        case "cache_read": cmp = a.cache_read_input_token_cost - b.cache_read_input_token_cost; break;
        case "cache_write": cmp = a.cache_creation_input_token_cost - b.cache_creation_input_token_cost; break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [models, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortAsc ? " ↑" : " ↓") : "");

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
          Reference
        </p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-950 hover:text-slate-700"
        >
          Model Price Table
          <span className="text-sm text-slate-400">{open ? "▲" : "▼"}</span>
        </button>
        <p className="text-[13px] text-slate-600">
          Prices per 1M tokens. Source: LiteLLM. {models.length} models available.
        </p>
      </div>

      {open && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search models…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-sm rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {filtered.length} models
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="pb-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort("name")}>
                      Model{sortIndicator("name")}
                    </th>
                    <th className="pb-2 pr-4 font-medium cursor-pointer" onClick={() => toggleSort("provider")}>
                      Provider{sortIndicator("provider")}
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right cursor-pointer" onClick={() => toggleSort("input")}>
                      Input{sortIndicator("input")}
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right cursor-pointer" onClick={() => toggleSort("output")}>
                      Output{sortIndicator("output")}
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right cursor-pointer" onClick={() => toggleSort("cache_read")}>
                      Cache Read{sortIndicator("cache_read")}
                    </th>
                    <th className="pb-2 font-medium text-right cursor-pointer" onClick={() => toggleSort("cache_write")}>
                      Cache Write{sortIndicator("cache_write")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.name} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{m.name}</td>
                      <td className="py-2 pr-4 text-slate-500">{m.provider}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(m.input_cost_per_token)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(m.output_cost_per_token)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(m.cache_read_input_token_cost)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtPrice(m.cache_creation_input_token_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
