import { useMemo, useState } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useChartScale } from "@/lib/contexts";
import { ChartScaleToggle } from "./chart-scale-toggle";
import type { WeekdayHeatmapEntry } from "@/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CELL = 22;
const GAP = 2;

const LEVELS = [
  "bg-muted",
  "bg-chart-1/20",
  "bg-chart-1/40",
  "bg-chart-1/60",
  "bg-chart-1/80",
];

function getLevel(count: number, max: number, isLog: boolean): number {
  if (count === 0 || max === 0) return 0;
  const r = isLog ? Math.log(count) / Math.log(max) : count / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

export function WeekdayHeatmap({ data }: { data: WeekdayHeatmapEntry[] }) {
  const { scale, isLog, toggle } = useChartScale();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const { grid, max } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let m = 0;
    for (const e of data) {
      if (e.day_index < 0 || e.day_index > 6 || e.hour < 0 || e.hour > 23) continue;
      g[e.day_index][e.hour] = e.count;
      if (e.count > m) m = e.count;
    }
    return { grid: g, max: m };
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Punchcard</CardTitle>
        <CardDescription>Session starts by hour and weekday</CardDescription>
        <CardAction>
          <ChartScaleToggle scale={scale} onToggle={toggle} />
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="relative" style={{ minWidth: 24 * (CELL + GAP) + 50 }}>
          {/* Hour labels */}
          <div className="flex text-xs text-muted-foreground mb-1" style={{ paddingLeft: 40 }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center" style={{ width: CELL + GAP }}>
                {h % 3 === 0 ? `${h}` : ""}
              </span>
            ))}
          </div>

          {/* Grid */}
          {DAYS.map((day, di) => (
            <div key={day} className="flex items-center" style={{ height: CELL + GAP }}>
              <span className="text-xs text-muted-foreground w-10 text-right pr-2">{day}</span>
              <div className="flex" style={{ gap: GAP }}>
                {Array.from({ length: 24 }, (_, h) => {
                  const count = grid[di][h];
                  const level = getLevel(count, max, isLog);
                  const tooltipText = count > 0
                    ? `${count} session${count > 1 ? "s" : ""} — ${day} ${h}:00`
                    : `No activity — ${day} ${h}:00`;
                  const showTooltip = (el: HTMLElement) => {
                    const rect = el.getBoundingClientRect();
                    const parentEl = el.closest(".relative");
                    if (!parentEl) return;
                    const parentRect = parentEl.getBoundingClientRect();
                    setTooltip({
                      x: rect.left - parentRect.left + CELL / 2,
                      y: rect.top - parentRect.top - 8,
                      text: tooltipText,
                    });
                  };
                  return (
                    <div
                      key={h}
                      role="gridcell"
                      tabIndex={0}
                      aria-label={tooltipText}
                      className={`rounded-sm ${LEVELS[level]} transition-colors focus:outline-none focus:ring-2 focus:ring-ring`}
                      style={{ width: CELL, height: CELL }}
                      onMouseEnter={(e) => showTooltip(e.currentTarget)}
                      onMouseLeave={() => setTooltip(null)}
                      onFocus={(e) => showTooltip(e.currentTarget)}
                      onBlur={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {tooltip && (
            <div
              className="absolute pointer-events-none z-10 px-2 py-1 text-xs rounded bg-popover text-popover-foreground border shadow-md whitespace-nowrap"
              style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
            >
              {tooltip.text}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
