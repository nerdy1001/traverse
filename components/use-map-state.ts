"use client";

import { useMemo, useState } from "react";
import { foldRepository, type Folding } from "@/lib/map/fold";
import type { Selection } from "@/lib/map/view";
import type { Edge, FileNode } from "@/parser/types";

export interface MapActions {
  open(directory: string): void;
  close(directory: string): void;
  /** A click on the map: clicking what's already selected deselects it. */
  selectFile(path: string): void;
  /** A click in the pane: always selects, and brings the file into view on the map. */
  revealFile(path: string): void;
  clearSelection(): void;
  scrollTo(directory: string, offset: number): void;
  hover(target: Selection | null): void;
}

export interface MapState {
  folding: Folding;
  opened: ReadonlySet<string>;
  offsets: ReadonlyMap<string, number>;
  selection: Selection | null;
  /** Shared by the map and the pane, so each can light up what the other points at. */
  hovered: Selection | null;
  /** The file a panel should scroll to, until the next thing the user does on the map. */
  reveal: string | null;
  actions: MapActions;
}

// Lives above both the map and the pane because both read and change it. Nothing
// here reaches the network: it is all derived from what the browser already holds.
export function useMapState(files: readonly FileNode[], edges: readonly Edge[]): MapState {
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [offsets, setOffsets] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hovered, setHovered] = useState<Selection | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);

  const folding = useMemo(() => foldRepository(files, edges), [files, edges]);

  const actions = useMemo<MapActions>(
    () => ({
      // One click opens and selects. The spec asks for both on a folded node,
      // and a click is the only gesture a folded node has.
      open(directory) {
        setOpened((current) => new Set(current).add(directory));
        setSelection({ kind: "folder", directory });
        setReveal(null);
        setHovered(null);
      },
      close(directory) {
        setOpened((current) => {
          const next = new Set(current);
          next.delete(directory);
          return next;
        });
        // The scroller goes with the panel, so it reopens at the top.
        setOffsets((current) => {
          const next = new Map(current);
          next.delete(directory);
          return next;
        });
        // A selection inside the closing panel has nothing left to point at.
        const held = folding.nodes.find((node) => node.directory === directory)?.files ?? [];
        setSelection((current) => {
          if (current?.kind === "folder" && current.directory === directory) return null;
          if (current?.kind === "file" && held.includes(current.path)) return null;
          return current;
        });
        setReveal(null);
        setHovered(null);
      },
      selectFile(path) {
        setSelection((current) =>
          current?.kind === "file" && current.path === path ? null : { kind: "file", path },
        );
        setReveal(null);
      },
      revealFile(path) {
        // A row only exists once its folder is open, so a file in a folded folder
        // has to open that folder for the map's selection to land anywhere.
        const holder = folding.nodes.find((node) => node.files.includes(path));
        if (holder) setOpened((current) => new Set(current).add(holder.directory));
        setSelection({ kind: "file", path });
        setReveal(path);
        // The row under the pointer is about to be replaced and won't report leaving.
        setHovered(null);
      },
      clearSelection() {
        setSelection(null);
        setReveal(null);
      },
      scrollTo(directory, offset) {
        // Rows change under a still pointer, so what was hovered is no longer there.
        setHovered(null);
        // Most scroll events stay within the same row, and those change nothing.
        setOffsets((current) =>
          (current.get(directory) ?? 0) === offset ? current : new Map(current).set(directory, offset),
        );
      },
      hover: setHovered,
    }),
    [folding],
  );

  return { folding, opened, offsets, selection, hovered, reveal, actions };
}
