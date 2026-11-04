"use client";

import { useState } from "react";
import type { Edge, FileNode, OmittedRoute, Route } from "@/parser/types";
import { CategoryRail } from "./category-rail";
import { DetailPane, type RepositoryFacts } from "./detail-pane";
import { MapCanvas } from "./map-canvas";
import { MapShell } from "./map-shell";
import { RouteTable } from "./route-table";
import { useMapState } from "./use-map-state";

type View = "map" | "routes";

export function MapWorkspace({
  files,
  edges,
  routes,
  omittedRoutes,
  sourceBase,
  facts,
}: {
  files: readonly FileNode[];
  edges: readonly Edge[];
  routes: readonly Route[];
  omittedRoutes: readonly OmittedRoute[];
  /** Where a file at the analysed commit can be read, when there's a commit to point at. */
  sourceBase: string | null;
  facts: RepositoryFacts;
}) {
  const map = useMapState(files, edges);
  const [view, setView] = useState<View>("map");
  const views: [View, string][] = [
    ["map", "Map"],
    ["routes", `Routes ${routes.length}`],
  ];
  return (
    <MapShell
      rail={<CategoryRail files={files} adapter={facts.framework} map={map} />}
      map={
        <>
          <div role="tablist" className="absolute top-2 left-11 z-10 flex h-7 rounded border border-border bg-background">
            {views.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`cursor-pointer px-2 tabular-nums ${view === id ? "bg-surface" : "text-muted hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Kept laid out under the table, so coming back finds the map where it was left. */}
          <div className={`h-full ${view === "map" ? "" : "invisible"}`}>
            <MapCanvas files={files} edges={edges} map={map} />
          </div>
          {view === "routes" && (
            <div className="absolute inset-0">
              <RouteTable routes={routes} omitted={omittedRoutes} framework={facts.framework} sourceBase={sourceBase} />
            </div>
          )}
        </>
      }
      detail={<DetailPane files={files} edges={edges} facts={facts} map={map} />}
      railOpen={map.railOpen}
      detailOpen={map.detailOpen}
      onToggleRail={map.actions.toggleRail}
      onToggleDetail={map.actions.toggleDetail}
    />
  );
}
