import { countByCategory } from "@/lib/map/categories";
import type { FileNode } from "@/parser/types";
import type { MapState } from "./use-map-state";

export function CategoryRail({
  files,
  map: { category, actions },
}: {
  files: readonly FileNode[];
  map: MapState;
}) {
  return (
    <ul className="py-3">
      {countByCategory(files).map(({ name, swatch, count }) => (
        <li key={name}>
          <button
            type="button"
            aria-pressed={category === name}
            onClick={() => actions.toggleCategory(name)}
            className={`flex h-8 w-full cursor-pointer items-center gap-2.5 px-4 text-left hover:bg-background ${category === name ? "bg-background outline outline-accent -outline-offset-1" : ""}`}
          >
            <span aria-hidden className={`size-2 shrink-0 rounded-[1px] ${swatch}`} />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="text-muted tabular-nums">{count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
