import { createContext, useContext, type ReactNode } from "react";
import type { TokenContextValue } from "./types";

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({ value, children }: { value: TokenContextValue | null; children: ReactNode }) {
  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue | null {
  return useContext(TokenContext);
}
