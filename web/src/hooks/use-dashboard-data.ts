import { useState, useEffect } from "react";
import { fetchDashboardData, type DashboardData, type DataSource } from "@/lib/api";

export function useDashboardData(source?: DataSource) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetchDashboardData(controller.signal, source).then((result) => {
      if (controller.signal.aborted) return;
      setData(result.data);
      setErrors(result.errors);
      setLoading(false);
    });

    return () => controller.abort();
  }, [source]);

  return { data, errors, loading };
}
