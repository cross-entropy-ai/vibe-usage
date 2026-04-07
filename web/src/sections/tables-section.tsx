import { useTables } from "@/lib/contexts";
import { ProjectsTable } from "@/components/projects-table";
import { HostsTable } from "@/components/hosts-table";
import { GitActivity } from "@/components/git-activity";
import { DirectoryChart } from "@/components/directory-chart";

export function TablesSection() {
  const tables = useTables();

  return (
    <>
      {tables?.projects && <ProjectsTable data={tables.projects} />}
      {tables?.hosts && <HostsTable data={tables.hosts} />}
      {tables?.gitActivity && tables.gitActivity.length > 0 && <GitActivity data={tables.gitActivity} />}
      {tables?.directories && tables.directories.length > 0 && <DirectoryChart data={tables.directories} />}
    </>
  );
}
