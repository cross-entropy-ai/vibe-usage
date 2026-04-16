import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableHead, useSortable } from "@/components/ui/sortable-head";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toolColor, sortedToolEntries } from "@/lib/utils";
import { fmtNum, fmtDurationMs } from "@/lib/formatters";
import type { ProjectDetail } from "@/types";

type ProjectSortKey =
  | "name"
  | "tools"
  | "sessions"
  | "messages"
  | "tokens"
  | "duration"
  | "period";

function sumValues(record: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(record)) n += v;
  return n;
}

function getProjectValue(p: ProjectDetail, key: ProjectSortKey): string | number {
  switch (key) {
    case "name": return p.name;
    case "tools": return sumValues(p.tools);
    case "sessions": return p.sessions;
    case "messages": return p.messages;
    case "tokens": return p.input_tokens + p.output_tokens;
    case "duration": return p.duration_ms;
    case "period": return p.last_seen;
  }
}

export function ProjectsTable({ data, limit = 20 }: { data: ProjectDetail[]; limit?: number }) {
  const { sort, toggle, sorted } = useSortable<ProjectDetail, ProjectSortKey>(
    data,
    getProjectValue,
    { key: "sessions", dir: "desc" },
  );
  const top = sorted.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Projects</CardTitle>
        <CardDescription>{data.length} projects tracked</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <SortableHead sortKey="name" sort={sort} onToggle={toggle}>Project</SortableHead>
              <SortableHead sortKey="tools" sort={sort} onToggle={toggle}>Tools</SortableHead>
              <SortableHead sortKey="sessions" sort={sort} onToggle={toggle} align="right">Sessions</SortableHead>
              <SortableHead sortKey="messages" sort={sort} onToggle={toggle} align="right">Messages</SortableHead>
              <SortableHead sortKey="tokens" sort={sort} onToggle={toggle} align="right">Tokens</SortableHead>
              <SortableHead sortKey="duration" sort={sort} onToggle={toggle} align="right">Duration</SortableHead>
              <SortableHead sortKey="period" sort={sort} onToggle={toggle} align="right">Period</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((p, i) => (
              <TableRow key={p.name}>
                <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-mono text-sm max-w-48 truncate" title={p.name}>
                  {p.name}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {sortedToolEntries(p.tools).map(([tool, count]) => (
                      <Badge key={tool} variant="secondary" className={`text-xs ${toolColor(tool)}`}>
                        {tool} {count}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold">{p.sessions}</TableCell>
                <TableCell className="text-right">{fmtNum(p.messages)}</TableCell>
                <TableCell className="text-right">{fmtNum(p.input_tokens + p.output_tokens)}</TableCell>
                <TableCell className="text-right">{p.duration_ms > 0 ? fmtDurationMs(p.duration_ms) : "—"}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  {p.first_seen === p.last_seen ? p.first_seen : `${p.first_seen} — ${p.last_seen}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
