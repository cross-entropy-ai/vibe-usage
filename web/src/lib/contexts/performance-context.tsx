import { createContext, useContext, type ReactNode } from "react";
import type { LatencyData } from "@/types";

const PerformanceContext = createContext<LatencyData | null>(null);

export function PerformanceProvider({ value, children }: { value: LatencyData | null; children: ReactNode }) {
  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
}

export function usePerformance(): LatencyData | null {
  return useContext(PerformanceContext);
}
