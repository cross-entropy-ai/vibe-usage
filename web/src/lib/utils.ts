import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Tool badge colors ──────────────────────────────────────────
const TOOL_COLORS: Record<string, string> = {
  claude: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  gemini: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  codex: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  kimi: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const FALLBACK_COLOR = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";

/** Return the badge color classes for a tool name, falling back to neutral gray. */
export function toolColor(tool: string): string {
  return TOOL_COLORS[tool] ?? FALLBACK_COLOR;
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
