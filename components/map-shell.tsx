import type { ReactNode } from "react";

// The layout is settled here. Later phases fill these columns, they don't move
// them, so the detail pane is a real column and never a drawer or an overlay.
// Height comes from the parent, so the shell can sit under a header or fill a page.
export function MapShell({
  rail,
  map,
  detail,
  railOpen,
  detailOpen,
  onToggleRail,
  onToggleDetail,
}: {
  rail: ReactNode;
  map: ReactNode;
  detail: ReactNode;
  railOpen: boolean;
  detailOpen: boolean;
  onToggleRail(): void;
  onToggleDetail(): void;
}) {
  return (
    <div className="flex h-full min-h-0">
      {railOpen && (
        <nav
          id="map-rail"
          aria-label="File categories"
          className="w-52 shrink-0 overflow-y-auto border-r border-border bg-surface"
        >
          {rail}
        </nav>
      )}
      <section aria-label="Map" className="relative min-w-0 flex-1 overflow-hidden">
        <PanelToggle side="left" label="categories" controls="map-rail" open={railOpen} onToggle={onToggleRail} />
        {map}
        <PanelToggle side="right" label="details" controls="map-detail" open={detailOpen} onToggle={onToggleDetail} />
      </section>
      {detailOpen && (
        <aside
          id="map-detail"
          aria-label="Details"
          className="w-88 shrink-0 overflow-hidden border-l border-border bg-surface"
        >
          {detail}
        </aside>
      )}
    </div>
  );
}

// Sits on the map rather than in the panel, because it has to stay reachable once the
// panel it controls is gone.
function PanelToggle({
  side,
  label,
  controls,
  open,
  onToggle,
}: {
  side: "left" | "right";
  label: string;
  controls: string;
  open: boolean;
  onToggle(): void;
}) {
  const action = `${open ? "Hide" : "Show"} ${label} panel`;
  return (
    <button
      type="button"
      aria-label={action}
      title={action}
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={onToggle}
      className={`absolute top-2 z-10 flex size-7 cursor-pointer items-center justify-center rounded border border-border bg-background hover:bg-surface ${
        side === "left" ? "left-2" : "right-2"
      } ${open ? "text-foreground" : "text-muted"}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        className="size-3.5"
      >
        <rect x="1.5" y="2.5" width="11" height="9" rx="1" />
        {side === "left" ? (
          <rect x="1.5" y="2.5" width="3.5" height="9" fill={open ? "currentColor" : "none"} />
        ) : (
          <rect x="9" y="2.5" width="3.5" height="9" fill={open ? "currentColor" : "none"} />
        )}
      </svg>
    </button>
  );
}
