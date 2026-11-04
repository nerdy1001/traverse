import { countByRole } from "@/lib/map/summary";
import type { FileNode } from "@/parser/types";

export function CategoryRail({ files }: { files: readonly FileNode[] }) {
  return (
    <ul className="py-2">
      {countByRole(files).map(([role, count]) => (
        <li key={role} className="flex h-6 items-center gap-2 px-3">
          {/* One colour until adapters give files real roles: the swatch says "no kind known". */}
          <span aria-hidden className="size-2 shrink-0 rounded-[1px] bg-role-generic" />
          <span className="min-w-0 flex-1 truncate">{role}</span>
          <span className="text-muted tabular-nums">{count}</span>
        </li>
      ))}
    </ul>
  );
}
