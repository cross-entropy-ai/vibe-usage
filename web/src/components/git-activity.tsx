import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNum } from "@/lib/formatters";
import type { GitRepoStat } from "@/types";

function shortenRepo(repo: string) {
  return repo
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^https?:\/\/gitlab\.com\//, "")
    .replace(/^https?:\/\/bitbucket\.org\//, "")
    .replace(/\.git$/, "");
}

export function GitActivity({ data, limit = 20 }: { data: GitRepoStat[]; limit?: number }) {
  const top = data.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Git Repository Activity</CardTitle>
        <CardDescription>AI tool usage by repository</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Repository</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Messages</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((r, i) => (
              <TableRow key={r.repo}>
                <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-mono text-sm max-w-48 truncate" title={r.repo}>
                  {shortenRepo(r.repo)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {r.branches.length} {r.branches.length === 1 ? "branch" : "branches"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-bold">{r.sessions}</TableCell>
                <TableCell className="text-right">{fmtNum(r.messages)}</TableCell>
                <TableCell className="text-right">{fmtNum(r.input_tokens + r.output_tokens)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  {r.last_seen}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
