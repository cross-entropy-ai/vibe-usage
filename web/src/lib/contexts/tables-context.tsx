import { createContext, useContext, type ReactNode } from "react";
import type { TablesContextValue } from "./types";

const TablesContext = createContext<TablesContextValue | null>(null);

export function TablesProvider({ value, children }: { value: TablesContextValue | null; children: ReactNode }) {
  return <TablesContext.Provider value={value}>{children}</TablesContext.Provider>;
}

export function useTables(): TablesContextValue | null {
  return useContext(TablesContext);
}
