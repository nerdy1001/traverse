// What each of the agent's lookups answers, from the same functions that draw the
// canvas and fill the detail pane. Pure: a stored map in, the agent's contract out.

import type { Coverage, Edge, FileNode, Route } from "../../parser/types.ts";
import { WALK_DEPTH, walk, type WalkDirection } from "../map/graph.ts";
import { indexNeighbours, summariseRepository } from "../map/summary.ts";
import { frameworkLabel, isRole } from "../map/taxonomy.ts";
// The agent owns the contract; the app imports its types and nothing else from there.
import type { FileEntry, FileList, Neighbours, RouteTable, Summary, Walk } from "../../traverse-agent/tools/contract.ts";

/**
 * Lists stop here and say how many there were. A whole large repository in one
 * lookup would bury the answer, and a list cut short without saying so is wrong.
 */
const LIST_LIMIT = 50;

export interface AgentMap {
  adapter: string;
  coverage: Coverage;
  files: FileNode[];
  edges: Edge[];
  routes: Route[];
  labelled: string[];
}

/** A lookup the model can get wrong. The message is written for the model to read. */
export type Answer<T> = { ok: true; body: T } | { ok: false; status: 400 | 404; message: string };

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function entry({ path, role }: FileNode): FileEntry {
  return { path, role };
}

function listOf(files: readonly FileNode[]): FileList {
  return { total: files.length, files: files.slice(0, LIST_LIMIT).map(entry) };
}

function roleCounts(files: readonly FileNode[]): { role: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { role } of files) counts.set(role, (counts.get(role) ?? 0) + 1);
  return [...counts]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count || compare(a.role, b.role));
}

export function summaryOf(map: AgentMap): Summary {
  const summary = summariseRepository(map.files, new Set(map.labelled));
  return {
    framework: frameworkLabel(map.adapter),
    files: map.files.length,
    connections: map.edges.length,
    routes: map.routes.length,
    roles: roleCounts(map.files),
    mostImported: summary.mostImported.map((file) => ({ ...entry(file), importedBy: file.fanIn })),
    importedCount: summary.importedCount,
    nothingImports: listOf(summary.nothingImports),
    unidentifiedCount: summary.unidentifiedCount,
    coverage: {
      filesFound: map.coverage.files.found,
      filesSkipped: map.coverage.files.skipped,
      importsSeen: map.coverage.imports.seen,
      importsUnresolved: map.coverage.imports.unresolved,
    },
  };
}

export function filesMatching(map: AgentMap, fragment: string): FileList {
  const needle = fragment.toLowerCase();
  return listOf(map.files.filter(({ path }) => path.toLowerCase().includes(needle)));
}

export function filesWithRole(map: AgentMap, role: string): Answer<FileList> {
  if (!isRole(role)) {
    const present = roleCounts(map.files).map(({ role: name }) => name).join(", ");
    return { ok: false, status: 400, message: `"${role}" is not a role. Roles in this repository: ${present}.` };
  }
  return { ok: true, body: listOf(map.files.filter((file) => file.role === role)) };
}

function fileAt(map: AgentMap, path: string): Answer<FileNode> {
  const file = map.files.find((candidate) => candidate.path === path);
  if (!file) return { ok: false, status: 404, message: `No file at ${path} in this repository. Paths must match exactly.` };
  return { ok: true, body: file };
}

export function neighboursOf(map: AgentMap, path: string): Answer<Neighbours> {
  const file = fileAt(map, path);
  if (!file.ok) return file;
  const links = indexNeighbours(map.files, map.edges).get(path);
  if (!links) throw new Error(`${path} is in the file list but not in its own neighbour index`);
  return { ok: true, body: { ...entry(file.body), ...links } };
}

export function walkFrom(map: AgentMap, path: string, direction: WalkDirection): Answer<Walk> {
  const file = fileAt(map, path);
  if (!file.ok) return file;
  return {
    ok: true,
    body: { ...entry(file.body), direction, maxDepth: WALK_DEPTH, reached: walk(map.edges, path, direction) },
  };
}

export function routeTableOf(map: AgentMap): RouteTable {
  return {
    routes: map.routes.map(({ method, pattern, path, line }) => ({ method, pattern, path, line })),
    omitted: map.coverage.omittedRoutes.length,
  };
}
