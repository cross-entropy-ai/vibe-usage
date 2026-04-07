// ── Tool Registry ─────────────────────────────────────────────────
// Single source of truth for all tool-related configuration.
// Adding a new AI tool only requires updating this file.

export const TOOL_NAMES = ["gemini", "claude", "codex", "kimi"] as const;
export type Tool = (typeof TOOL_NAMES)[number];

interface ToolConfig {
  label: string;
  badgeClass: string;
  chartColor: string;
  hslColor: string;
}

const TOOL_CONFIG: Record<Tool, ToolConfig> = {
  claude: {
    label: "Claude",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    chartColor: "var(--chart-1)",
    hslColor: "hsl(221 83% 53%)",
  },
  gemini: {
    label: "Gemini",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    chartColor: "var(--chart-2)",
    hslColor: "hsl(142 71% 45%)",
  },
  codex: {
    label: "Codex",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    chartColor: "var(--chart-3)",
    hslColor: "hsl(25 95% 53%)",
  },
  kimi: {
    label: "Kimi",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    chartColor: "var(--chart-4)",
    hslColor: "hsl(271 76% 53%)",
  },
};

const FALLBACK_BADGE = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
const FALLBACK_HSL = "hsl(215 20% 65%)";

export function toolBadgeClass(tool: string): string {
  return TOOL_CONFIG[tool as Tool]?.badgeClass ?? FALLBACK_BADGE;
}

export function toolChartColor(tool: string): string {
  return TOOL_CONFIG[tool as Tool]?.chartColor ?? "var(--chart-5)";
}

export function toolHslColor(tool: string): string {
  return TOOL_CONFIG[tool as Tool]?.hslColor ?? FALLBACK_HSL;
}

export function toolLabel(tool: string): string {
  return TOOL_CONFIG[tool as Tool]?.label ?? tool.charAt(0).toUpperCase() + tool.slice(1);
}

/** Generic palette for charts with many categories (file types, task types, etc.) */
export const CHART_PALETTE = [
  "#2563eb", "#f97316", "#10b981", "#8b5cf6",
  "#ef4444", "#06b6d4", "#d946ef", "#f59e0b",
];
