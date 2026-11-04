// What the detail pane says about the repository, a folder or a file. Pure, and
// derived from the parser's file and edge lists like everything else on the map.

import type { Edge, FileNode } from "../../parser/types.ts";

/** A ranking, not a listing: past this it stops saying what the repository leans on. */
const MOST_IMPORTED_SHOWN = 10;

export interface RepositorySummary {
  mostImported: FileNode[];
  /** How many files anything imports, so the ranking can say what it was cut from. */
  importedCount: number;
  /** Complete, unlike the ranking above, and led by what pulls in the most. */
  nothingImports: FileNode[];
  unidentifiedCount: number;
}

export interface Neighbours {
  dependsOn: string[];
  dependents: string[];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function summariseRepository(files: readonly FileNode[]): RepositorySummary {
  const imported = files.filter(({ fanIn }) => fanIn > 0);
  return {
    mostImported: imported
      .sort((a, b) => b.fanIn - a.fanIn || compare(a.path, b.path))
      .slice(0, MOST_IMPORTED_SHOWN),
    importedCount: imported.length,
    nothingImports: files
      .filter(({ fanIn }) => fanIn === 0)
      .sort((a, b) => b.fanOut - a.fanOut || compare(a.path, b.path)),
    unidentifiedCount: files.filter(({ role }) => role === "generic").length,
  };
}

/** Built once per repository, so selecting or hovering a file is only ever a lookup. */
export function indexNeighbours(
  files: readonly FileNode[],
  edges: readonly Edge[],
): Map<string, Neighbours> {
  const index = new Map<string, Neighbours>(
    files.map(({ path }) => [path, { dependsOn: [], dependents: [] }]),
  );
  for (const { from, to } of edges) {
    const source = index.get(from);
    const target = index.get(to);
    if (!source || !target) throw new Error(`Edge ${from} -> ${to} has an end that is not in the file list`);
    source.dependsOn.push(to);
    target.dependents.push(from);
  }
  for (const { dependsOn, dependents } of index.values()) {
    dependsOn.sort(compare);
    dependents.sort(compare);
  }
  return index;
}
