import type { ComponentType, ReactNode } from "react";

type ProviderEntry<V = unknown> = [
  ComponentType<{ value: V; children: ReactNode }>,
  V,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function composeProviders(providers: ProviderEntry<any>[], children: ReactNode): ReactNode {
  return providers.reduceRight<ReactNode>(
    (acc, [Provider, value]) => <Provider value={value}>{acc}</Provider>,
    children,
  );
}
