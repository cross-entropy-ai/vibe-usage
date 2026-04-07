import { createContext, useContext, type ReactNode } from "react";
import type { CostData } from "@/types";

const CostContext = createContext<CostData | null>(null);

export function CostProvider({ value, children }: { value: CostData | null; children: ReactNode }) {
  return <CostContext.Provider value={value}>{children}</CostContext.Provider>;
}

export function useCost(): CostData | null {
  return useContext(CostContext);
}
