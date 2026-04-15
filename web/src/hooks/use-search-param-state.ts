import { useState, useCallback } from "react";

/**
 * Like useState, but syncs the value to a URL search parameter.
 * Reads the initial value from the URL; writes back via replaceState
 * so the browser history isn't polluted on every filter change.
 */
export function useSearchParamState<T extends string>(
  key: string,
  defaultValue: T,
  allowed?: readonly T[],
): [T, (value: T) => void] {
  const [value, setValueRaw] = useState<T>(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(key) as T | null;
    if (raw !== null && (!allowed || (allowed as readonly string[]).includes(raw))) {
      return raw;
    }
    return defaultValue;
  });

  const setValue = useCallback(
    (next: T) => {
      setValueRaw(next);
      const params = new URLSearchParams(window.location.search);
      if (next === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      history.replaceState(null, "", url);
    },
    [key, defaultValue],
  );

  return [value, setValue];
}
