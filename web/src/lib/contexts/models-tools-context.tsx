import { createContext, useContext, type ReactNode } from "react";
import type { ModelsToolsContextValue } from "./types";

const ModelsToolsContext = createContext<ModelsToolsContextValue | null>(null);

export function ModelsToolsProvider({ value, children }: { value: ModelsToolsContextValue | null; children: ReactNode }) {
  return <ModelsToolsContext.Provider value={value}>{children}</ModelsToolsContext.Provider>;
}

export function useModelsTools(): ModelsToolsContextValue | null {
  return useContext(ModelsToolsContext);
}
