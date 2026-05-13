import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Info } from "lucide-react";
import { fmtNum } from "@/lib/formatters";

interface HostToolStat {
  tool: string;
  sessions: number;
  files: number;
  bytes: number;
}

interface HostInfo {
  hostname: string;
  total_sessions: number;
  last_activity: string | null;
  first_activity: string | null;
  tools: HostToolStat[];
}

interface EndpointInfo {
  method: string;
  path: string;
  description: string;
}

interface ServerInfo {
  version: string;
  data_dir: string;
  raw_dir: string;
  cache_dir: string;
  collectors: string[];
}

interface InfoResponse {
  server: ServerInfo;
  hosts: HostInfo[];
  endpoints: EndpointInfo[];
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function InfoDialog() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<InfoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || info) return;
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    fetch("/api/info", { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<InfoResponse>;
      })
      .then((data) => {
        setInfo(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [open, info]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={(props) => (
          <button
            {...props}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <Info className="size-3.5" />
            About
          </button>
        )}
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl transition-all data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Dialog.Title className="text-base font-semibold text-slate-950">
            Data Sources & API
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-slate-600">
            What this dashboard is reading and where it gets its data from.
          </Dialog.Description>

          {loading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
          {error && (
            <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          {info && (
            <div className="mt-4 space-y-5">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Server</h3>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[120px_1fr]">
                  <dt className="text-slate-500">Version</dt>
                  <dd className="font-mono text-slate-800">{info.server.version}</dd>
                  <dt className="text-slate-500">Data dir</dt>
                  <dd className="break-all font-mono text-slate-800">{info.server.data_dir}</dd>
                  <dt className="text-slate-500">Raw dir</dt>
                  <dd className="break-all font-mono text-slate-800">{info.server.raw_dir}</dd>
                  <dt className="text-slate-500">Cache dir</dt>
                  <dd className="break-all font-mono text-slate-800">{info.server.cache_dir}</dd>
                  <dt className="text-slate-500">Collectors</dt>
                  <dd className="font-mono text-slate-800">{info.server.collectors.join(", ")}</dd>
                </dl>
              </section>

              <section>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Connected hosts
                  </h3>
                  <span className="text-[11px] text-slate-500">{info.hosts.length} host(s)</span>
                </div>
                <div className="mt-2 space-y-2">
                  {info.hosts.map((host) => (
                    <div key={host.hostname} className="rounded border border-slate-200 bg-slate-50/60 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-medium text-slate-900">{host.hostname}</span>
                        <span className="text-slate-500">
                          {fmtNum(host.total_sessions)} sessions &middot; last {fmtDate(host.last_activity)}
                        </span>
                      </div>
                      {host.tools.length > 0 && (
                        <table className="mt-2 w-full text-[11px]">
                          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="py-1 pr-2 text-left font-medium">Tool</th>
                              <th className="py-1 pr-2 text-right font-medium">Sessions</th>
                              <th className="py-1 pr-2 text-right font-medium">Files</th>
                              <th className="py-1 text-right font-medium">Size</th>
                            </tr>
                          </thead>
                          <tbody>
                            {host.tools.map((t) => (
                              <tr key={t.tool} className="border-t border-slate-100">
                                <td className="py-1 pr-2 font-mono text-slate-700">{t.tool}</td>
                                <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{fmtNum(t.sessions)}</td>
                                <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{fmtNum(t.files)}</td>
                                <td className="py-1 text-right tabular-nums text-slate-600">{fmtBytes(t.bytes)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    API endpoints
                  </h3>
                  <span className="text-[11px] text-slate-500">{info.endpoints.length} routes</span>
                </div>
                <div className="mt-2 max-h-[260px] overflow-y-auto rounded border border-slate-200">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {info.endpoints.map((ep) => (
                        <tr key={ep.path} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-2 py-1 align-top">
                            <span className="rounded bg-emerald-100 px-1 py-0.5 font-mono text-[9px] font-medium text-emerald-800">
                              {ep.method}
                            </span>
                          </td>
                          <td className="px-2 py-1 align-top font-mono text-slate-800">{ep.path}</td>
                          <td className="px-2 py-1 align-top text-slate-600">{ep.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Dialog.Close
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              )}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
