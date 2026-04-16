import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableHead, useSortable } from "@/components/ui/sortable-head";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toolColor, sortedToolEntries } from "@/lib/utils";
import { fmtNum } from "@/lib/formatters";
import type { HostStat } from "@/types";

type HostSortKey = "hostname" | "sessions" | "messages" | "tokens" | "tools";

function sumValues(record: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(record)) n += v;
  return n;
}

function getHostValue(h: HostStat, key: HostSortKey): string | number {
  switch (key) {
    case "hostname": return h.hostname;
    case "sessions": return h.sessions;
    case "messages": return h.messages;
    case "tokens": return h.input_tokens + h.output_tokens;
    case "tools": return sumValues(h.tools);
  }
}

export function HostsTable({ data }: { data: HostStat[] }) {
  const { sort, toggle, sorted } = useSortable<HostStat, HostSortKey>(
    data,
    getHostValue,
    { key: "sessions", dir: "desc" },
  );

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Hosts</CardTitle>
        <CardDescription>Usage aggregated by hostname</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead sortKey="hostname" sort={sort} onToggle={toggle}>Hostname</SortableHead>
              <SortableHead sortKey="sessions" sort={sort} onToggle={toggle} align="right">Sessions</SortableHead>
              <SortableHead sortKey="messages" sort={sort} onToggle={toggle} align="right">Messages</SortableHead>
              <SortableHead sortKey="tokens" sort={sort} onToggle={toggle} align="right">Tokens</SortableHead>
              <SortableHead sortKey="tools" sort={sort} onToggle={toggle}>Tools</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((h) => (
              <TableRow key={h.hostname}>
                <TableCell className="font-mono text-sm">{h.hostname}</TableCell>
                <TableCell className="text-right font-bold">{h.sessions}</TableCell>
                <TableCell className="text-right">{fmtNum(h.messages)}</TableCell>
                <TableCell className="text-right">{fmtNum(h.input_tokens + h.output_tokens)}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {sortedToolEntries(h.tools).map(([tool, count]) => (
                      <Badge key={tool} variant="secondary" className={`text-xs ${toolColor(tool)}`}>
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
