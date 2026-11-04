import type { Coverage, SkipReason, UnresolvedReason } from "../../parser/types.ts";

export interface GraphCoverage {
  /** Rounded down, so 99.6% can't read as complete. Null when there's nothing to measure. */
  percent: number | null;
  imports: { drawn: number; total: number };
  files: { parsed: number; total: number };
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}

function hasNumbers(value: unknown, keys: readonly string[]): boolean {
  return keys.every((key) => typeof field(value, key) === "number");
}

/** Coverage comes back from a JSON column, so its shape is checked rather than assumed. */
export function isCoverage(value: unknown): value is Coverage {
  const files = field(value, "files");
  const imports = field(value, "imports");
  return (
    hasNumbers(files, ["found", "parsed", "skipped"]) &&
    hasNumbers(field(files, "skippedBy"), ["not-source", "too-large", "unreadable", "syntax-error", "symlink"]) &&
    hasNumbers(imports, ["seen", "resolved", "external", "excluded", "unresolved"]) &&
    hasNumbers(field(imports, "excludedBy"), ["non-source-target", "skipped-target", "excluded-directory-target"]) &&
    typeof field(imports, "unresolvedBy") === "object" &&
    typeof field(value, "unresolvedExamples") === "object" &&
    Array.isArray(field(value, "skippedFiles")) &&
    Array.isArray(field(value, "configProblems")) &&
    // Missing from a run before adapters, whose stored roles and routes aren't there
    // either. Failing here sends it to a re-run rather than drawing it all as generic.
    Array.isArray(field(value, "omittedRoutes"))
  );
}

/**
 * How much of what should be on the map is on it. External packages and imports of
 * non-code like CSS were never going to be drawn, so they don't count against it.
 * Files count separately because a file that couldn't be parsed loses its imports
 * without any being seen. The lower of the two is the figure: either alone can make a
 * badly partial graph look fine.
 */
export function graphCoverage({ files, imports }: Coverage): GraphCoverage {
  const drawn = imports.resolved;
  const importTotal =
    drawn + imports.unresolved + imports.excludedBy["skipped-target"] + imports.excludedBy["excluded-directory-target"];
  const fileTotal = files.found - files.skippedBy["not-source"];

  // No imports at all isn't 100% of them. There's nothing to say the graph is right.
  if (importTotal === 0 || fileTotal === 0) {
    return { percent: null, imports: { drawn, total: importTotal }, files: { parsed: files.parsed, total: fileTotal } };
  }
  const percent = Math.floor(Math.min(drawn / importTotal, files.parsed / fileTotal) * 100);
  return { percent, imports: { drawn, total: importTotal }, files: { parsed: files.parsed, total: fileTotal } };
}

export const UNRESOLVED_LABELS: readonly (readonly [UnresolvedReason, string])[] = [
  ["file-not-found", "File not found"],
  ["case-mismatch", "Wrong letter case in the path"],
  ["alias-target-not-found", "Path alias points at nothing"],
  ["unknown-alias", "Path alias not recognised"],
  ["undeclared-package", "Package not declared in package.json"],
  ["workspace-entry-not-found", "Workspace package has no entry file"],
  ["non-literal-dynamic-import", "Dynamic import computed at runtime"],
];

export const SKIP_LABELS: readonly (readonly [SkipReason, string])[] = [
  ["too-large", "Over the size limit"],
  ["unreadable", "Couldn't be read"],
  ["syntax-error", "Syntax error"],
  ["symlink", "Symbolic link"],
];
