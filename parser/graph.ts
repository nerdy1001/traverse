import type { Edge, ImportKind } from "./types.ts";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Collapses repeated imports into one edge per pair, in a stable order. */
export function dedupeEdges(
  connections: readonly { from: string; to: string; kind: ImportKind }[],
): Edge[] {
  const pairs = new Map<string, { from: string; to: string; kinds: Set<ImportKind> }>();
  for (const { from, to, kind } of connections) {
    const key = `${from}\0${to}`;
    const pair = pairs.get(key) ?? { from, to, kinds: new Set<ImportKind>() };
    pair.kinds.add(kind);
    pairs.set(key, pair);
  }
  return [...pairs.values()]
    .map(({ from, to, kinds }) => ({ from, to, kinds: [...kinds].sort(compare) }))
    .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to));
}

/** Expects deduplicated edges, so each count is a count of distinct files. */
export function computeFan(
  paths: readonly string[],
  edges: readonly Edge[],
): Map<string, { fanIn: number; fanOut: number }> {
  const fan = new Map(paths.map((path) => [path, { fanIn: 0, fanOut: 0 }]));
  for (const { from, to } of edges) {
    const source = fan.get(from);
    const target = fan.get(to);
    if (!source || !target) {
      throw new Error(`Edge ${from} -> ${to} ends on a file that is not a node`);
    }
    source.fanOut += 1;
    target.fanIn += 1;
  }
  return fan;
}
