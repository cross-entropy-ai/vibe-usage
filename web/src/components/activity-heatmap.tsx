import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyStat } from "@/types";

const WEEKS = 53;
const CELL_SIZE = 12;
const CELL_GAP = 3;
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

const LEVELS = [
  "bg-muted",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-emerald-400 dark:bg-emerald-700",
  "bg-emerald-500 dark:bg-emerald-500",
  "bg-emerald-700 dark:bg-emerald-400",
];

function getLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  // Log scale: map log(count)/log(max) to 4 levels
  const ratio = Math.log(count) / Math.log(max);
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildGrid(daily: DailyStat[]) {
  const lookup = new Map<string, DailyStat>();
  for (const d of daily) lookup.set(d.date, d);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // End on the current Saturday (end of week row)
  const endDay = new Date(today);
  endDay.setDate(endDay.getDate() + (6 - endDay.getDay()));

  // Start 52 weeks before the end day's Sunday
  const startDay = new Date(endDay);
  startDay.setDate(startDay.getDate() - (WEEKS * 7 - 1));

  const cells: { date: Date; dateStr: string; stat: DailyStat | undefined }[] = [];
  const d = new Date(startDay);
  while (d <= endDay) {
    const dateStr = formatDate(d);
    cells.push({ date: new Date(d), dateStr, stat: lookup.get(dateStr) });
    d.setDate(d.getDate() + 1);
  }

  return { cells, startDay, endDay };
}

export function ActivityHeatmap({ daily }: { daily: DailyStat[] }) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const { cells } = useMemo(() => buildGrid(daily), [daily]);

  const maxSessions = useMemo(
    () => Math.max(1, ...cells.map((c) => c.stat?.sessions ?? 0)),
    [cells],
  );

  // Compute month label positions
  const monthPositions = useMemo(() => {
    const positions: { label: string; weekIdx: number }[] = [];
    let lastMonth = -1;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const month = cell.date.getMonth();
      if (month !== lastMonth && cell.date.getDay() === 0) {
        const weekIdx = Math.floor(i / 7);
        // Avoid duplicate labels at boundary
        if (positions.length === 0 || positions[positions.length - 1].weekIdx < weekIdx - 1) {
          positions.push({ label: MONTH_LABELS[month], weekIdx });
        }
        lastMonth = month;
      }
    }
    return positions;
  }, [cells]);

  const svgWidth = WEEKS * (CELL_SIZE + CELL_GAP) + 30;

  // Organize cells into columns (weeks) x rows (days)
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const totalSessions = cells.reduce((s, c) => s + (c.stat?.sessions ?? 0), 0);
  const activeDays = cells.filter((c) => (c.stat?.sessions ?? 0) > 0).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Activity</CardTitle>
        <p className="text-xs text-muted-foreground">
          {totalSessions} sessions in the last year &middot; {activeDays} active days
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="relative" style={{ minWidth: svgWidth }}>
          {/* Month labels */}
          <div className="flex text-xs text-muted-foreground mb-1" style={{ paddingLeft: 30 }}>
            {monthPositions.map((mp) => (
              <span
                key={`${mp.label}-${mp.weekIdx}`}
                className="absolute"
                style={{ left: 30 + mp.weekIdx * (CELL_SIZE + CELL_GAP) }}
              >
                {mp.label}
              </span>
            ))}
          </div>

          <div className="flex gap-0 mt-5" style={{ paddingLeft: 30 }}>
            {/* Day-of-week labels */}
            <div
              className="flex flex-col text-xs text-muted-foreground mr-1"
              style={{ position: "absolute", left: 0 }}
            >
              {DAY_LABELS.map((label, i) => (
                <span
                  key={i}
                  style={{
                    height: CELL_SIZE + CELL_GAP,
                    lineHeight: `${CELL_SIZE + CELL_GAP}px`,
                    fontSize: 10,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Grid */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell) => {
                    const sessions = cell.stat?.sessions ?? 0;
                    const level = getLevel(sessions, maxSessions);
                    const isToday = cell.dateStr === formatDate(new Date());
                    const tooltipText =
                      sessions > 0
                        ? `${sessions} session${sessions > 1 ? "s" : ""} on ${cell.dateStr}`
                        : `No activity on ${cell.dateStr}`;
                    const showTooltip = (el: HTMLElement) => {
                      const rect = el.getBoundingClientRect();
                      const parentEl = el.closest(".relative");
                      if (!parentEl) return;
                      const parentRect = parentEl.getBoundingClientRect();
                      setTooltip({
                        x: rect.left - parentRect.left + CELL_SIZE / 2,
                        y: rect.top - parentRect.top - 8,
                        text: tooltipText,
                      });
                    };
                    return (
                      <div
                        key={cell.dateStr}
                        role="gridcell"
                        tabIndex={0}
                        aria-label={tooltipText}
                        className={`rounded-sm ${LEVELS[level]} ${isToday ? "ring-1 ring-foreground/30" : ""} transition-colors focus:outline-none focus:ring-2 focus:ring-ring`}
                        style={{ width: CELL_SIZE, height: CELL_SIZE }}
                        onMouseEnter={(e) => showTooltip(e.currentTarget)}
                        onMouseLeave={() => setTooltip(null)}
                        onFocus={(e) => showTooltip(e.currentTarget)}
                        onBlur={() => setTooltip(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute pointer-events-none z-10 px-2 py-1 text-xs rounded bg-popover text-popover-foreground border shadow-md whitespace-nowrap"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: "translate(-50%, -100%)",
              }}
            >
              {tooltip.text}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground justify-end">
          <span>Less</span>
          {LEVELS.map((cls, i) => (
            <div
              key={i}
              className={`rounded-sm ${cls}`}
              style={{ width: CELL_SIZE, height: CELL_SIZE }}
            />
          ))}
          <span>More</span>
        </div>
      </CardContent>
    </Card>
  );
}
