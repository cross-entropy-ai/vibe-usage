import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toolColor, sortedToolEntries } from "@/lib/utils";
import type { ProjectDetail } from "@/types";

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function fmtDuration(ms: number) {
  const min = ms / 60000;
  if (min >= 60) return (min / 60).toFixed(1) + "h";
  return Math.round(min) + "m";
}

export function ProjectsTable({ data }: { data: ProjectDetail[] }) {
  const top = data.slice(0, 20);

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
              <TableHead>Project</TableHead>
              <TableHead>Tools</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Period</TableHead>
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
                <TableCell className="text-right">{p.duration_ms > 0 ? fmtDuration(p.duration_ms) : "—"}</TableCell>
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
