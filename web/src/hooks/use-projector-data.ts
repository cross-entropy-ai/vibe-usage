import { useState, useEffect, useRef } from "react";
import type { ProjectorModelsResponse, UsageSummary } from "@/types/projector";
import type { DateRange } from "@/lib/api";

export function useProjectorData(dateRange?: DateRange) {
  const [models, setModels] = useState<ProjectorModelsResponse | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const hasData = useRef(false);

  const from = dateRange?.from;
  const to = dateRange?.to;

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const signal = controller.signal;

    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const suffix = params.toString() ? `?${params.toString()}` : "";

    Promise.allSettled([
      fetch("/api/projector/models", { signal }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ProjectorModelsResponse>;
      }),
      fetch(`/api/projector/usage-summary${suffix}`, { signal }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<UsageSummary>;
      }),
    ]).then(([modelsResult, usageResult]) => {
      if (signal.aborted) return;
      const errs: string[] = [];
      if (modelsResult.status === "fulfilled") setModels(modelsResult.value);
      else errs.push(`Models: ${modelsResult.reason}`);
      if (usageResult.status === "fulfilled") setUsage(usageResult.value);
      else errs.push(`Usage: ${usageResult.reason}`);
      setErrors(errs);
      setLoading(false);
      hasData.current = true;
    });

    return () => controller.abort();
  }, [from, to]);

  return { models, usage, loading, errors, initialLoad: loading && !hasData.current };
}
