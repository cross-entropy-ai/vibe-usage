import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toolColor, sortedToolEntries } from "@/lib/utils";
import type { HostStat } from "@/types";

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export function HostsTable({ data }: { data: HostStat[] }) {
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
              <TableHead>Hostname</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead>Tools</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((h) => (
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
