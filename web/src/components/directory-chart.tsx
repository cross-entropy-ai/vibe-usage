import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableHead, useSortable } from "@/components/ui/sortable-head";
import { Badge } from "@/components/ui/badge";
import { toolColor, sortedToolEntries } from "@/lib/utils";
import { fmtNum } from "@/lib/formatters";
import type { DirectoryStat } from "@/types";

const config = {
  sessions: { label: "Sessions", color: "var(--chart-1)" },
} satisfies ChartConfig;

type DirSortKey = "directory" | "sessions" | "messages" | "tokens" | "tools";

function sumValues(record: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(record)) n += v;
  return n;
}

function getDirValue(d: DirectoryStat, key: DirSortKey): string | number {
  switch (key) {
    case "directory": return d.directory;
    case "sessions": return d.sessions;
    case "messages": return d.messages;
    case "tokens": return d.input_tokens + d.output_tokens;
    case "tools": return sumValues(d.tools);
  }
}

/** Keep the last 2 path segments and truncate to 25 chars. */
function shortenDir(dir: string): string {
  const parts = dir.replace(/^~\//, "").replace(/\/$/, "").split("/");
  const short = parts.length <= 2 ? parts.join("/") : parts.slice(-2).join("/");
  return short.length > 25 ? short.slice(0, 22) + "..." : short;
}

export function DirectoryChart({ data, limit = 15 }: { data: DirectoryStat[]; limit?: number }) {
  const { sort, toggle, sorted } = useSortable<DirectoryStat, DirSortKey>(
    data,
    getDirValue,
    { key: "sessions", dir: "desc" },
  );
  const top = data.slice(0, limit).map((d) => ({
    ...d,
    shortDir: shortenDir(d.directory),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Working Directories</CardTitle>
        <CardDescription>AI tool usage by working directory</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Bar chart: top 15 by sessions ─────────────────── */}
        <ChartContainer config={config} className="h-[400px] w-full">
          <BarChart
            data={top}
            layout="vertical"
            accessibilityLayer
            margin={{ left: 20 }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="shortDir"
              type="category"
              width={160}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_label, payload) => {
                    const item = payload?.[0]?.payload as DirectoryStat | undefined;
                    return item?.directory ?? _label;
                  }}
                />
              }
            />
            <Bar
              dataKey="sessions"
              fill="var(--color-sessions)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>

        {/* ── Full table ────────────────────────────────────── */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <SortableHead sortKey="directory" sort={sort} onToggle={toggle}>Directory</SortableHead>
              <SortableHead sortKey="sessions" sort={sort} onToggle={toggle} align="right">Sessions</SortableHead>
              <SortableHead sortKey="messages" sort={sort} onToggle={toggle} align="right">Messages</SortableHead>
              <SortableHead sortKey="tokens" sort={sort} onToggle={toggle} align="right">Tokens</SortableHead>
              <SortableHead sortKey="tools" sort={sort} onToggle={toggle}>Tools</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((d, i) => (
              <TableRow key={d.directory}>
                <TableCell className="font-mono text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell
                  className="font-mono text-sm max-w-64 truncate"
                  title={d.directory}
                >
                  {d.directory}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {d.sessions}
                </TableCell>
                <TableCell className="text-right">
                  {fmtNum(d.messages)}
                </TableCell>
                <TableCell className="text-right">
                  {fmtNum(d.input_tokens + d.output_tokens)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {sortedToolEntries(d.tools).map(([tool, count]) => (
                      <Badge
                        key={tool}
                        variant="secondary"
                        className={`text-xs ${toolColor(tool)}`}
                      >
                        {tool} {count}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
