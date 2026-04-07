import { createContext, useContext, type ReactNode } from "react";
import type { ActivityContextValue } from "./types";

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ value, children }: { value: ActivityContextValue | null; children: ReactNode }) {
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity(): ActivityContextValue | null {
  return useContext(ActivityContext);
}
