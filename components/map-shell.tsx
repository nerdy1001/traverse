import type { ReactNode } from "react";

// The layout is settled here. Later phases fill these columns, they don't move
// them, so the detail pane is a real column and never a drawer or an overlay.
// Height comes from the parent, so the shell can sit under a header or fill a page.
export function MapShell({
  rail,
  map,
  detail,
}: {
  rail: ReactNode;
  map: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label="File categories"
        className="w-44 shrink-0 overflow-y-auto border-r border-border bg-surface"
      >
        {rail}
      </nav>
      <main aria-label="Map" className="min-w-0 flex-1 overflow-hidden">
        {map}
      </main>
      <aside
        aria-label="Details"
        className="w-80 shrink-0 overflow-hidden border-l border-border bg-surface"
      >
        {detail}
      </aside>
    </div>
  );
}
