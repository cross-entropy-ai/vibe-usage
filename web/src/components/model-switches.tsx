import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ModelSwitchData } from "@/types";

export function ModelSwitches({ data, limit = 8 }: { data: ModelSwitchData; limit?: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Model Switches</CardTitle>
        <CardDescription>
          {data.sessions_with_switch} of {data.total_sessions} sessions ({data.switch_rate_pct}%) switched models mid-conversation
        </CardDescription>
      </CardHeader>
      {data.top_switches.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Switch</TableHead><TableHead className="text-right">Count</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.top_switches.slice(0, limit).map((s) => (
                <TableRow key={s.switch}>
                  <TableCell className="font-mono text-xs">{s.switch}</TableCell>
                  <TableCell className="text-right">{s.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
