import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export function useSortable<T, K extends string>(
  data: T[],
  getValue: (row: T, key: K) => string | number,
  initial: SortState<K>,
) {
  const [sort, setSort] = React.useState<SortState<K>>(initial);

  const sorted = React.useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const av = getValue(a, sort.key);
      const bv = getValue(b, sort.key);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sort, getValue]);

  const toggle = React.useCallback((key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  }, []);

  return { sort, toggle, sorted };
}

interface SortableHeadProps<K extends string>
  extends Omit<React.ComponentProps<"th">, "onToggle"> {
  sortKey: K;
  sort: SortState<K>;
  onToggle: (key: K) => void;
  align?: "left" | "right";
}

export function SortableHead<K extends string>({
  sortKey,
  sort,
  onToggle,
  align = "left",
  className,
  children,
  ...thProps
}: SortableHeadProps<K>) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      {...thProps}
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span>{children}</span>
        <Icon className={cn("h-3 w-3", !active && "opacity-50")} />
      </button>
    </TableHead>
  );
}
