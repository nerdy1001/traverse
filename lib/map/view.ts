// What is on screen for a given set of opened folders. Pure and derived fresh
// from the parser's output. Boxes depend only on the data and which folders are
// open, so scrolling a panel changes where edges land without moving anything.

import type { Edge, FileNode } from "../../parser/types.ts";
import type { Folding, FoldedNode } from "./fold.ts";

/** A panel shows this many rows and scrolls the rest, rather than growing without limit. */
export const VISIBLE_ROWS = 12;

// Monospace, so a label's width is known without measuring the DOM. Layout has
// to know every size before anything renders for the picture to be deterministic.
const LABEL_CHAR_WIDTH = 7.2;
const BOX_PADDING = 24;
/** Holds the count line. The same for every node, so it never implies importance. */
const MIN_WIDTH = 124;
const ROW_NUMBERS_WIDTH = 64;

const MIN_FOLDER_HEIGHT = 40;
const MAX_FOLDER_HEIGHT = 96;
export const PANEL_HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 22;

export interface FileRow {
  path: string;
  label: string;
  fanIn: number;
  fanOut: number;
}

interface BoxBase {
  id: string;
  directory: string;
  label: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  width: number;
  height: number;
}

export interface FolderBox extends BoxBase {
  kind: "folder";
}

export interface PanelBox extends BoxBase {
  kind: "panel";
  /** Every file in the folder, most depended-on first. */
  rows: FileRow[];
}

export type Box = FolderBox | PanelBox;

export interface Link {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  /** Identifies each end for selection. */
  sourceEnd: string;
  targetEnd: string;
  /** Both ends sit in the same panel, so it is only drawn for a selected row. */
  internal: boolean;
  /** The parsed edges this link stands for, so selecting a file finds exactly its own. */
  pairs: { from: string; to: string }[];
}

export interface Connections {
  links: Link[];
  /** Where each file in an open panel is currently attached. */
  fileEnds: Map<string, string>;
}

export interface View extends Connections {
  boxes: Box[];
}

export type Selection =
  | { kind: "folder"; directory: string }
  | { kind: "file"; path: string };

export interface Highlight {
  /** The ends that stay at full strength. */
  ends: Set<string>;
  /** The box whose whole contents stay at full strength, if a folder is selected. */
  box: string | null;
  selectedPath: string | null;
  /** Direction relative to the selection, for the links it touches. */
  links: Map<string, "incoming" | "outgoing">;
}

export const FOLDER_HANDLE = "node";
/** Where edges land for files scrolled off the top: the panel's header. */
export const ABOVE_HANDLE = "above";
/** Where edges land for files scrolled off the bottom: the panel's "more" row. */
export const MORE_HANDLE = "more";

/**
 * Handles belong to the visible slots, not the files. A slot never moves relative
 * to its panel, so scrolling only changes which edge uses it and nothing has to be
 * measured again.
 */
export function slotHandle(slot: number): string {
  return `slot:${slot}`;
}

export function endKey(boxId: string, handle: string): string {
  return `${boxId}|${handle}`;
}

export function sourceHandleId(handle: string): string {
  return `${handle}:out`;
}

export function targetHandleId(handle: string): string {
  return `${handle}:in`;
}

/** Enters on the same side the link left from, so it arcs outside the panel. */
export function internalTargetHandleId(handle: string): string {
  return `${handle}:in-right`;
}

function folderId(directory: string): string {
  return `folder:${directory}`;
}

function panelId(directory: string): string {
  return `panel:${directory}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The shortest trailing part of each path that nothing else shares. Every label
 * in a clash lengthens together, so no path's label depends on the order they're
 * visited in.
 */
export function shortestLabels(paths: readonly string[]): Map<string, string> {
  const segments = new Map(paths.map((path) => [path, path.split("/")]));
  const lengths = new Map(paths.map((path) => [path, 1]));
  const labelOf = (path: string) => (segments.get(path) ?? []).slice(-(lengths.get(path) ?? 1)).join("/");

  // Terminates: paths are distinct, so a clash always has a label that can grow.
  for (;;) {
    const holders = new Map<string, string[]>();
    for (const path of paths) {
      const label = labelOf(path);
      holders.set(label, [...(holders.get(label) ?? []), path]);
    }

    let grew = false;
    for (const clashing of holders.values()) {
      if (clashing.length < 2) continue;
      for (const path of clashing) {
        const length = lengths.get(path) ?? 1;
        if (length < (segments.get(path)?.length ?? 1)) {
          lengths.set(path, length + 1);
          grew = true;
        }
      }
    }
    if (!grew) return new Map(paths.map((path) => [path, labelOf(path)]));
  }
}

function folderHeight(fanIn: number, maxFanIn: number): number {
  if (maxFanIn === 0) return MIN_FOLDER_HEIGHT;
  // Square root because fan-in is heavily skewed: a linear scale would leave one
  // tall node and every other indistinguishable. Still strictly ordered by fan-in.
  const share = Math.sqrt(fanIn / maxFanIn);
  return Math.round(MIN_FOLDER_HEIGHT + (MAX_FOLDER_HEIGHT - MIN_FOLDER_HEIGHT) * share);
}

function labelWidth(label: string): number {
  return Math.ceil(label.length * LABEL_CHAR_WIDTH) + BOX_PADDING;
}

/** Most depended-on first, so a panel opens on the rows that matter most. */
function rankedFiles(node: FoldedNode, fileByPath: ReadonlyMap<string, FileNode>): FileNode[] {
  return node.files
    .flatMap((path) => fileByPath.get(path) ?? [])
    .sort((a, b) => b.fanIn - a.fanIn || compare(a.path, b.path));
}

export function buildBoxes(
  files: readonly FileNode[],
  folding: Folding,
  opened: ReadonlySet<string>,
): Box[] {
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const maxFanIn = Math.max(0, ...folding.nodes.map(({ fanIn }) => fanIn));

  const openFiles = new Map<string, FileNode[]>();
  for (const node of folding.nodes) {
    if (opened.has(node.directory)) openFiles.set(node.directory, rankedFiles(node, fileByPath));
  }

  // Every file in an open panel counts, including scrolled-out ones. Otherwise a
  // label and the panel's width would change as you scroll.
  const labels = shortestLabels([
    ...folding.nodes.map(({ directory }) => directory),
    ...[...openFiles.values()].flat().map(({ path }) => path),
  ]);
  const labelFor = (path: string) => labels.get(path) ?? path;

  return folding.nodes.map((node): Box => {
    const shared = {
      directory: node.directory,
      label: labelFor(node.directory),
      fileCount: node.files.length,
      fanIn: node.fanIn,
      fanOut: node.fanOut,
    };
    const held = openFiles.get(node.directory);
    if (!held) {
      return {
        ...shared,
        kind: "folder",
        id: folderId(node.directory),
        width: Math.max(MIN_WIDTH, labelWidth(shared.label)),
        height: folderHeight(node.fanIn, maxFanIn),
      };
    }

    const rows = held.map(({ path, fanIn, fanOut }) => ({ path, label: labelFor(path), fanIn, fanOut }));
    const overflows = rows.length > VISIBLE_ROWS;
    const rowsWidth = ROW_NUMBERS_WIDTH;
    return {
      ...shared,
      kind: "panel",
      id: panelId(node.directory),
      rows,
      width: Math.max(
        MIN_WIDTH + rowsWidth,
        labelWidth(shared.label),
        ...rows.map(({ label }) => labelWidth(label) + rowsWidth),
      ),
      height:
        PANEL_HEADER_HEIGHT + (Math.min(rows.length, VISIBLE_ROWS) + (overflows ? 1 : 0)) * ROW_HEIGHT,
    };
  });
}

/** `offsets` holds, per open folder, the index of the first row in view. */
export function buildConnections(
  edges: readonly Edge[],
  boxes: readonly Box[],
  folding: Folding,
  offsets: ReadonlyMap<string, number>,
): Connections {
  const fileEnds = new Map<string, { box: string; handle: string }>();

  for (const box of boxes) {
    if (box.kind !== "panel") continue;
    const offset = offsets.get(box.directory) ?? 0;
    box.rows.forEach(({ path }, index) => {
      const slot = index - offset;
      const handle =
        slot < 0 ? ABOVE_HANDLE : slot >= VISIBLE_ROWS ? MORE_HANDLE : slotHandle(slot);
      fileEnds.set(path, { box: box.id, handle });
    });
  }
  for (const { directory, files } of folding.nodes) {
    for (const path of files) {
      if (!fileEnds.has(path)) fileEnds.set(path, { box: folderId(directory), handle: FOLDER_HANDLE });
    }
  }

  const endOf = (path: string) => {
    const end = fileEnds.get(path);
    if (!end) throw new Error(`Edge end ${path} is not in the file list`);
    return end;
  };

  const links = new Map<string, Link>();
  for (const { from, to } of edges) {
    const source = endOf(from);
    const target = endOf(to);
    const sourceEnd = endKey(source.box, source.handle);
    const targetEnd = endKey(target.box, target.handle);
    // Files folded or scrolled into one end: a link to itself would say nothing.
    if (sourceEnd === targetEnd) continue;

    const id = JSON.stringify([sourceEnd, targetEnd]);
    const existing = links.get(id);
    if (existing) {
      existing.pairs.push({ from, to });
      continue;
    }

    const internal = source.box === target.box;
    links.set(id, {
      id,
      source: source.box,
      target: target.box,
      sourceHandle: sourceHandleId(source.handle),
      targetHandle: internal ? internalTargetHandleId(target.handle) : targetHandleId(target.handle),
      sourceEnd,
      targetEnd,
      internal,
      pairs: [{ from, to }],
    });
  }

  return {
    links: [...links.values()].sort((a, b) => compare(a.id, b.id)),
    fileEnds: new Map(
      [...fileEnds].map(([path, { box, handle }]) => [path, endKey(box, handle)]),
    ),
  };
}

export function highlightOf(view: View, selection: Selection): Highlight {
  const highlight: Highlight = { ends: new Set(), box: null, selectedPath: null, links: new Map() };

  if (selection.kind === "folder") {
    const box = view.boxes.find(({ directory }) => directory === selection.directory);
    if (!box) return highlight;
    highlight.box = box.id;
    for (const link of view.links) {
      if (link.internal) continue;
      if (link.source === box.id) {
        highlight.links.set(link.id, "outgoing");
        highlight.ends.add(link.targetEnd);
      } else if (link.target === box.id) {
        highlight.links.set(link.id, "incoming");
        highlight.ends.add(link.sourceEnd);
      }
    }
    return highlight;
  }

  const { path } = selection;
  const selected = view.fileEnds.get(path);
  if (selected === undefined) return highlight;
  highlight.selectedPath = path;
  highlight.ends.add(selected);
  for (const link of view.links) {
    // Matched on the parsed edges, not the ends: a scrolled-out file shares its
    // end with others, and those others aren't what was selected.
    if (link.pairs.some(({ from }) => from === path)) {
      highlight.links.set(link.id, "outgoing");
      highlight.ends.add(link.targetEnd);
    } else if (link.pairs.some(({ to }) => to === path)) {
      highlight.links.set(link.id, "incoming");
      highlight.ends.add(link.sourceEnd);
    }
  }
  return highlight;
}
