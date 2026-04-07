import { createContext, useContext, type ReactNode } from "react";
import type { Summary } from "@/types";

const SummaryContext = createContext<Summary | null>(null);

export function SummaryProvider({ value, children }: { value: Summary | null; children: ReactNode }) {
  return <SummaryContext.Provider value={value}>{children}</SummaryContext.Provider>;
}

export function useSummary(): Summary | null {
  return useContext(SummaryContext);
}
