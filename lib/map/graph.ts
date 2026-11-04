// Arithmetic over the edge list. Pure, with nothing to fetch and nothing to mock.

import type { Edge } from "../../parser/types.ts";

/** Who imports this file, or what this file imports. */
export type WalkDirection = "dependents" | "dependencies";

/** Deeper returns most of the repository and stops being an answer. */
const WALK_DEPTH = 2;

export interface Reached {
  path: string;
  /** How many imports away, counted along the shortest way there. */
  depth: number;
}

export interface Cycle {
  /** Each file imports the next, and the last imports the first. */
  loop: string[];
  /** How many files can all reach each other, of which `loop` is the shortest way round one. */
  groupSize: number;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function adjacency(
  edges: readonly Edge[],
  direction: WalkDirection = "dependencies",
): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const { from, to } of edges) {
    const [start, end] = direction === "dependencies" ? [from, to] : [to, from];
    const list = next.get(start);
    if (list) list.push(end);
    else next.set(start, [end]);
  }
  return next;
}

/** Blast radius and dependency chain are this one walk, in opposite directions. */
export function walk(
  edges: readonly Edge[],
  start: string,
  direction: WalkDirection,
  maxDepth: number = WALK_DEPTH,
): Reached[] {
  const next = adjacency(edges, direction);
  // Holds the start, so a cycle can't list a file as depending on itself.
  const seen = new Set([start]);
  const reached: Reached[] = [];

  let level = [start];
  for (let depth = 1; depth <= maxDepth && level.length > 0; depth++) {
    const following: string[] = [];
    for (const path of level) {
      for (const neighbour of next.get(path) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        following.push(neighbour);
        reached.push({ path: neighbour, depth });
      }
    }
    level = following;
  }
  return reached.sort((a, b) => a.depth - b.depth || compare(a.path, b.path));
}

/**
 * Tarjan's strongly connected components, with its call stack held in an array: a
 * real repository chains deep enough to blow a recursive one.
 */
function stronglyConnected(next: ReadonlyMap<string, readonly string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const groups: string[][] = [];
  let counter = 0;

  const enter = (path: string) => {
    index.set(path, counter);
    low.set(path, counter);
    counter += 1;
    stack.push(path);
    onStack.add(path);
  };
  const lowOf = (path: string) => low.get(path) ?? Number.POSITIVE_INFINITY;

  for (const root of [...next.keys()].sort(compare)) {
    if (index.has(root)) continue;
    enter(root);
    const frames = [{ path: root, cursor: 0 }];

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const neighbours = next.get(frame.path) ?? [];

      if (frame.cursor < neighbours.length) {
        const neighbour = neighbours[frame.cursor];
        frame.cursor += 1;
        if (!index.has(neighbour)) {
          enter(neighbour);
          frames.push({ path: neighbour, cursor: 0 });
        } else if (onStack.has(neighbour)) {
          low.set(frame.path, Math.min(lowOf(frame.path), index.get(neighbour) ?? 0));
        }
        continue;
      }

      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.path, Math.min(lowOf(parent.path), lowOf(frame.path)));

      if (lowOf(frame.path) === index.get(frame.path)) {
        const group: string[] = [];
        for (;;) {
          const member = stack.pop();
          if (member === undefined) throw new Error(`Component stack ran out at ${frame.path}`);
          onStack.delete(member);
          group.push(member);
          if (member === frame.path) break;
        }
        groups.push(group);
      }
    }
  }
  return groups;
}

/** The shortest way out of `start` and back to it, staying inside its group. */
function shortestLoop(
  start: string,
  group: ReadonlySet<string>,
  next: ReadonlyMap<string, readonly string[]>,
): string[] {
  const cameFrom = new Map<string, string>();
  let level = [start];
  while (level.length > 0) {
    const following: string[] = [];
    for (const path of level) {
      for (const neighbour of next.get(path) ?? []) {
        if (neighbour === start) {
          const loop = [path];
          for (let at = cameFrom.get(path); at !== undefined; at = cameFrom.get(at)) loop.push(at);
          return loop.reverse();
        }
        if (cameFrom.has(neighbour) || !group.has(neighbour)) continue;
        cameFrom.set(neighbour, path);
        following.push(neighbour);
      }
    }
    level = following;
  }
  throw new Error(`${start} is in a cycle group but has no way back to itself`);
}

/**
 * One entry per group of files that can all reach each other. Most of a large
 * repository can land in a single group, which nobody can check by reading it, so
 * each comes with one concrete loop that can be walked by hand.
 */
export function findCycles(edges: readonly Edge[]): Cycle[] {
  const next = adjacency(edges);
  const cycles: Cycle[] = [];
  for (const group of stronglyConnected(next)) {
    const [only] = group;
    // Alone in its group, a file is only in a cycle if it imports itself.
    if (group.length === 1 && !next.get(only)?.includes(only)) continue;
    // Smallest path, so the same data always shows the same loop.
    const start = [...group].sort(compare)[0];
    cycles.push({ loop: shortestLoop(start, new Set(group), next), groupSize: group.length });
  }
  return cycles.sort((a, b) => b.groupSize - a.groupSize || compare(a.loop[0], b.loop[0]));
}
