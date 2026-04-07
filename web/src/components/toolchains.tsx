import { PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHART_PALETTE } from "@/lib/tools";
import type { ToolchainsData } from "@/types";

export function Toolchains({ data, chainLimit = 12, fileTypeLimit = 10 }: { data: ToolchainsData; chainLimit?: number; fileTypeLimit?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tool Call Chains</CardTitle>
          <CardDescription>Most common consecutive tool call pairs</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Chain</TableHead><TableHead className="text-right">Count</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.top_chains.slice(0, chainLimit).map((c) => (
                <TableRow key={c.chain}>
                  <TableCell className="font-mono text-xs">{c.chain}</TableCell>
                  <TableCell className="text-right">{c.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">File Types</CardTitle>
          <CardDescription>Most frequently touched file extensions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div className="w-[200px] h-[240px]">
              <PieChart width={200} height={240}>
                <Pie data={data.file_types.slice(0, fileTypeLimit)} dataKey="count" nameKey="extension" cx="50%" cy="40%" outerRadius={65}>
                  {data.file_types.slice(0, fileTypeLimit).map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                </Pie>
                <Legend
                  formatter={(value: string) => `.${value}`}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ext</TableHead><TableHead className="text-right">Count</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.file_types.slice(0, fileTypeLimit).map((f) => (
                  <TableRow key={f.extension}>
                    <TableCell className="font-mono">.{f.extension}</TableCell>
                    <TableCell className="text-right">{f.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
