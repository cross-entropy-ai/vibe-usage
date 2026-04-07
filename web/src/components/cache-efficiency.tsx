import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtNum } from "@/lib/formatters";
import type { CacheEfficiencyData } from "@/types";

export function CacheEfficiency({ data, modelLimit = 8 }: { data: CacheEfficiencyData; modelLimit?: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cache Efficiency</CardTitle>
        <CardDescription>Prompt cache hit rate by tool and model</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-2">By Tool</h4>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tool</TableHead><TableHead className="text-right">Hit Rate</TableHead>
                <TableHead className="text-right">Cache Read</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.by_tool.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-right">{t.hit_rate_pct}%</TableCell>
                    <TableCell className="text-right">{fmtNum(t.cache_read_tokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">By Model</h4>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Model</TableHead><TableHead className="text-right">Hit Rate</TableHead>
                <TableHead className="text-right">Cache Read</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.by_model.slice(0, modelLimit).map((m) => (
                  <TableRow key={m.name}>
                    <TableCell className="font-medium text-xs">{m.name.replace(/-\d{8}$/, "").slice(0, 22)}</TableCell>
                    <TableCell className="text-right">{m.hit_rate_pct}%</TableCell>
                    <TableCell className="text-right">{fmtNum(m.cache_read_tokens)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
