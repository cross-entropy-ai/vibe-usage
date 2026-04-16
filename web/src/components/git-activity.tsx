import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableHead, useSortable } from "@/components/ui/sortable-head";
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

type GitSortKey =
  | "repo"
  | "branches"
  | "sessions"
  | "messages"
  | "tokens"
  | "last_seen";

function getGitValue(r: GitRepoStat, key: GitSortKey): string | number {
  switch (key) {
    case "repo": return shortenRepo(r.repo);
    case "branches": return r.branches.length;
    case "sessions": return r.sessions;
    case "messages": return r.messages;
    case "tokens": return r.input_tokens + r.output_tokens;
    case "last_seen": return r.last_seen;
  }
}

export function GitActivity({ data, limit = 20 }: { data: GitRepoStat[]; limit?: number }) {
  const { sort, toggle, sorted } = useSortable<GitRepoStat, GitSortKey>(
    data,
    getGitValue,
    { key: "sessions", dir: "desc" },
  );
  const top = sorted.slice(0, limit);

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
              <SortableHead sortKey="repo" sort={sort} onToggle={toggle}>Repository</SortableHead>
              <SortableHead sortKey="branches" sort={sort} onToggle={toggle}>Branches</SortableHead>
              <SortableHead sortKey="sessions" sort={sort} onToggle={toggle} align="right">Sessions</SortableHead>
              <SortableHead sortKey="messages" sort={sort} onToggle={toggle} align="right">Messages</SortableHead>
              <SortableHead sortKey="tokens" sort={sort} onToggle={toggle} align="right">Tokens</SortableHead>
              <SortableHead sortKey="last_seen" sort={sort} onToggle={toggle} align="right">Last Active</SortableHead>
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
