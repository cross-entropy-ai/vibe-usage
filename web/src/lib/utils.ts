import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export { toolBadgeClass as toolColor } from "@/lib/tools"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sort `Object.entries(record)` by value descending, then by key ascending as
 * a tiebreaker. This produces a deterministic, most-important-first order.
 */
export function sortedToolEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}
