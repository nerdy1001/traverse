"use client";

import type { Edge, FileNode } from "@/parser/types";
import { CategoryRail } from "./category-rail";
import { DetailPane, type RepositoryFacts } from "./detail-pane";
import { MapCanvas } from "./map-canvas";
import { MapShell } from "./map-shell";
import { useMapState } from "./use-map-state";

export function MapWorkspace({
  files,
  edges,
  facts,
}: {
  files: readonly FileNode[];
  edges: readonly Edge[];
  facts: RepositoryFacts;
}) {
  const map = useMapState(files, edges);
  return (
    <MapShell
      rail={<CategoryRail files={files} map={map} />}
      map={<MapCanvas files={files} edges={edges} map={map} />}
      detail={<DetailPane files={files} edges={edges} facts={facts} map={map} />}
    />
  );
}
