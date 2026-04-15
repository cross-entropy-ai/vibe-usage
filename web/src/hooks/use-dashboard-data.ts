import { useState, useEffect, useRef } from "react";
import { fetchDashboardData, type DashboardData, type DataSource, type DateRange } from "@/lib/api";

export function useDashboardData(dateRange?: DateRange, source?: DataSource) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // True only on initial load (no data yet). False once we have data to show.
  const hasData = useRef(false);

  const rangeKey = `${dateRange?.from ?? ""}_${dateRange?.to ?? ""}`;

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();

    fetchDashboardData(controller.signal, source, dateRange).then((result) => {
      if (controller.signal.aborted) return;
      setData(result.data);
      setErrors(result.errors);
      setLoading(false);
      hasData.current = true;
    });

    return () => controller.abort();
  }, [rangeKey, source]);

  return { data, errors, loading, initialLoad: loading && !hasData.current };
}
