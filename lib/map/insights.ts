// Four facts about the edge list. No model finds these or words them, and there is
// no total anywhere: a count of findings would read as a grade.

import type { Edge, FileNode } from "../../parser/types.ts";
import { categoryOf, UNIDENTIFIED } from "./categories.ts";
import { type Cycle, findCycles } from "./graph.ts";

/** A round number, so what's listed doesn't shift with the rest of the repository. */
const LONG_FILE_LINES = 1000;

export const INSIGHT_SENTENCES = {
  nothingImports: "Nothing in this repository imports these files.",
  unusuallyImported: "An unusual number of files import these.",
  cycles: "Each of these files imports the next, and the last imports the first.",
  long: "These files are over 1,000 lines long.",
} as const;

export interface Insights {
  nothingImports: FileNode[];
  /** Nothing imports these either, but something other than an import reaches them. */
  reachedAnotherWayCount: number;
  unusuallyImported: FileNode[];
  cycles: Cycle[];
  long: FileNode[];
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Three standard deviations over the mean, measured on this repository, so what's
 * unusual is decided by the repository. Below about a dozen files nothing can get
 * that far from the mean, which is right: a tiny repository has no usual to depart from.
 */
function unusualFanInFloor(files: readonly FileNode[]): number {
  const mean = files.reduce((sum, { fanIn }) => sum + fanIn, 0) / files.length;
  const variance = files.reduce((sum, { fanIn }) => sum + (fanIn - mean) ** 2, 0) / files.length;
  return mean + 3 * Math.sqrt(variance);
}

export function findInsights(files: readonly FileNode[], edges: readonly Edge[]): Insights {
  // A file importing itself still isn't imported by anything else.
  const imported = new Set(edges.filter(({ from, to }) => from !== to).map(({ to }) => to));
  const unimported = files.filter(({ path }) => !imported.has(path));
  // A framework, test runner or compiler reaches everything a convention identifies.
  // The import graph was never going to show that, so absence here says nothing.
  const nothingImports = unimported.filter(({ path }) => categoryOf(path) === UNIDENTIFIED);

  const floor = files.length > 0 ? unusualFanInFloor(files) : 0;
  return {
    nothingImports: nothingImports.sort((a, b) => b.fanOut - a.fanOut || compare(a.path, b.path)),
    reachedAnotherWayCount: unimported.length - nothingImports.length,
    unusuallyImported: files
      .filter(({ fanIn }) => fanIn > floor)
      .sort((a, b) => b.fanIn - a.fanIn || compare(a.path, b.path)),
    cycles: findCycles(edges),
    long: files
      .filter(({ lines }) => lines > LONG_FILE_LINES)
      .sort((a, b) => b.lines - a.lines || compare(a.path, b.path)),
  };
}
