// Decides what the map draws at rest. Pure, and derived from the parser's output
// rather than reshaping it: the file and edge lists stay exactly as parsed.

import type { Edge, FileNode } from "../../parser/types.ts";

/** "Roughly two dozen": past this, a map stops being readable at a glance. */
const MAX_NODES = 24;

/** "Fewer than a couple of files" merges, so the search starts by keeping pairs. */
const LOWEST_THRESHOLD = 2;

export interface FoldedNode {
  /** The directory that absorbed these files. "." for the root. */
  directory: string;
  /** Sorted, so the same data always folds to the same thing. */
  files: string[];
  /** Distinct files outside this node with an edge into it. */
  fanIn: number;
  /** Distinct files outside this node that it has an edge to. */
  fanOut: number;
}

export interface FoldedEdge {
  from: string;
  to: string;
  /** How many file-to-file edges this one stands for. */
  count: number;
}

export interface Folding {
  threshold: number;
  nodes: FoldedNode[];
  edges: FoldedEdge[];
}

function parentOf(directory: string): string {
  const slash = directory.lastIndexOf("/");
  return slash === -1 ? "." : directory.slice(0, slash);
}

function depthOf(directory: string): number {
  return directory === "." ? 0 : directory.split("/").length;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every directory starts as its own node, including ones holding only directories. */
function startingDirectories(files: readonly FileNode[]): Map<string, string[]> {
  const held = new Map<string, string[]>([[".", []]]);
  for (const { path, folder } of files) {
    for (let directory = folder; !held.has(directory); directory = parentOf(directory)) {
      held.set(directory, []);
    }
    held.get(folder)?.push(path);
  }
  return held;
}

function foldAt(files: readonly FileNode[], threshold: number): Map<string, string[]> {
  const held = startingDirectories(files);
  const deepest = Math.max(...[...held.keys()].map(depthOf));

  // A merge only ever adds to the shallower depth, so a parent sees everything
  // merged from below it, and no directory sees a sibling's merge. The root has
  // no parent and stays.
  for (let depth = deepest; depth > 0; depth--) {
    const atDepth = [...held.keys()].filter((directory) => depthOf(directory) === depth);
    for (const directory of atDepth) {
      const contents = held.get(directory) ?? [];
      if (contents.length >= threshold) continue;
      held.get(parentOf(directory))?.push(...contents);
      held.delete(directory);
    }
  }

  // Only the root can reach here empty, and an empty node has nothing to show.
  for (const [directory, contents] of held) {
    if (contents.length === 0) held.delete(directory);
  }
  return held;
}

function connect(held: ReadonlyMap<string, string[]>, edges: readonly Edge[]) {
  const nodeOf = new Map<string, string>();
  for (const [directory, contents] of held) {
    for (const path of contents) nodeOf.set(path, directory);
  }

  const counts = new Map<string, FoldedEdge>();
  const dependents = new Map<string, Set<string>>();
  const dependencies = new Map<string, Set<string>>();

  for (const { from, to } of edges) {
    const fromNode = nodeOf.get(from);
    const toNode = nodeOf.get(to);
    if (fromNode === undefined || toNode === undefined) {
      // The parser guarantees both ends are files. Dropping one would silently
      // lose an edge, so a violation has to stop the map rather than draw it.
      throw new Error(`Edge ${from} -> ${to} has an end that is not in the file list`);
    }
    if (fromNode === toNode) continue;

    const key = JSON.stringify([fromNode, toNode]);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { from: fromNode, to: toNode, count: 1 });

    if (!dependents.has(toNode)) dependents.set(toNode, new Set());
    dependents.get(toNode)?.add(from);
    if (!dependencies.has(fromNode)) dependencies.set(fromNode, new Set());
    dependencies.get(fromNode)?.add(to);
  }

  return { counts, dependents, dependencies };
}

/** Stops at the lowest threshold that gets under the limit. Nothing is picked in advance. */
export function foldRepository(files: readonly FileNode[], edges: readonly Edge[]): Folding {
  let threshold = LOWEST_THRESHOLD;
  let held = foldAt(files, threshold);
  // Terminates: once the threshold passes the file count, only the root is left.
  while (held.size > MAX_NODES) {
    threshold += 1;
    held = foldAt(files, threshold);
  }

  const { counts, dependents, dependencies } = connect(held, edges);

  return {
    threshold,
    nodes: [...held.entries()]
      .map(([directory, contents]) => ({
        directory,
        files: [...contents].sort(compare),
        fanIn: dependents.get(directory)?.size ?? 0,
        fanOut: dependencies.get(directory)?.size ?? 0,
      }))
      .sort((a, b) => compare(a.directory, b.directory)),
    edges: [...counts.values()].sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to)),
  };
}
