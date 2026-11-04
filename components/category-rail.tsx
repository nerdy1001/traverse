import { countByCategory } from "@/lib/map/categories";
import type { FileNode } from "@/parser/types";
import type { MapState } from "./use-map-state";

export function CategoryRail({
  files,
  adapter,
  map: { category, actions },
}: {
  files: readonly FileNode[];
  adapter: string;
  map: MapState;
}) {
  return (
    <ul className="py-3">
      {countByCategory(files, adapter).map(({ role, name, swatch, count }) => (
        <li key={role}>
          <button
            type="button"
            // Listed so the rail keeps its shape, but there's nothing for it to pick out.
            disabled={count === 0}
            aria-pressed={category === role}
            onClick={() => actions.toggleCategory(role)}
            className={`flex h-8 w-full items-center gap-2.5 px-4 text-left ${count === 0 ? "text-muted" : "cursor-pointer hover:bg-background"} ${category === role ? "bg-background outline outline-accent -outline-offset-1" : ""}`}
          >
            <span aria-hidden className={`size-2 shrink-0 rounded-[1px] ${count === 0 ? "bg-border" : swatch}`} />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="text-muted tabular-nums">{count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
