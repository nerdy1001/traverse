import { posix } from "node:path";
import { rolesFor } from "../lib/map/taxonomy.ts";
import { computeFan } from "./graph.ts";
import type { ImportCounts, ParseResult } from "./types.ts";

function checkCounts(label: string, counts: ImportCounts, problems: string[]): void {
  if (counts.seen !== counts.resolved + counts.external + counts.excluded + counts.unresolved) {
    problems.push(`${label}: seen does not equal the sum of its states`);
  }
  const sum = (tally: Record<string, number>) => Object.values(tally).reduce((a, b) => a + b, 0);
  if (sum(counts.excludedBy) !== counts.excluded) problems.push(`${label}: excluded reasons do not add up`);
  if (sum(counts.unresolvedBy) !== counts.unresolved) problems.push(`${label}: unresolved reasons do not add up`);
}

/** What must hold of any result. Returns every violation, empty when sound. */
export function findViolations(result: ParseResult): string[] {
  const problems: string[] = [];
  const { files, edges, coverage } = result;

  if (coverage.files.found !== coverage.files.parsed + coverage.files.skipped) {
    problems.push("files: found does not equal parsed + skipped");
  }
  if (files.length !== coverage.files.parsed) problems.push("files: parsed does not match the file list");
  if (coverage.skippedFiles.length !== coverage.files.skipped) problems.push("files: skipped does not match the skip list");
  for (const { path, reason, detail } of coverage.skippedFiles) {
    if (!reason || !detail) problems.push(`skip without a reason: ${path}`);
  }
  for (const { path, folder } of files) {
    if (!folder || folder !== posix.dirname(path)) problems.push(`wrong folder on ${path}: ${folder}`);
  }

  const paths = files.map(({ path }) => path);
  if (new Set(paths).size !== paths.length) problems.push("files: duplicate paths");
  const pairs = new Set(edges.map(({ from, to }) => `${from}\0${to}`));
  if (pairs.size !== edges.length) problems.push("edges: duplicate pairs");

  const nodes = new Set(paths);
  const dangling = edges.filter(({ from, to }) => !nodes.has(from) || !nodes.has(to));
  for (const { from, to } of dangling) problems.push(`edge ends off the map: ${from} -> ${to}`);
  if (dangling.length === 0) {
    const fan = computeFan(paths, edges);
    for (const { path, fanIn, fanOut } of files) {
      const expected = fan.get(path);
      if (expected?.fanIn !== fanIn || expected?.fanOut !== fanOut) problems.push(`wrong fan counts on ${path}`);
    }
  }

  const allowedRoles = rolesFor(result.adapter);
  for (const { path, role } of files) {
    if (!allowedRoles.includes(role)) problems.push(`${path} has a role ${result.adapter} doesn't list: ${role}`);
  }

  const routeKeys = new Set<string>();
  for (const { path, method, pattern, line } of result.routes) {
    const label = `${method} ${pattern} in ${path}:${line}`;
    if (!nodes.has(path)) problems.push(`route read from a file off the map: ${label}`);
    if (!method || !pattern.startsWith("/")) problems.push(`route without a full method and pattern: ${label}`);
    const key = `${path}\0${method}\0${pattern}`;
    if (routeKeys.has(key)) problems.push(`duplicate route: ${label}`);
    routeKeys.add(key);
  }

  for (const { path } of result.commonJsExports) {
    if (!nodes.has(path)) problems.push(`exports read from a file off the map: ${path}`);
  }

  checkCounts("imports", coverage.imports, problems);
  for (const [kind, counts] of Object.entries(coverage.importsByKind)) checkCounts(kind, counts, problems);
  return problems;
}
