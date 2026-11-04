import { readdirSync } from "node:fs";
import type { ExcludedDirectory, SkippedFile } from "./types.ts";

const DIRECTORY_REASONS: Record<string, string> = {
  node_modules: "installed dependencies",
  bower_components: "installed dependencies",
  dist: "build output",
  build: "build output",
  out: "build output",
  coverage: "test coverage output",
};

const SOURCE_EXTENSION = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function directoryExclusion(name: string): string | undefined {
  // Object.hasOwn because a directory can legitimately be called "constructor".
  if (Object.hasOwn(DIRECTORY_REASONS, name)) return DIRECTORY_REASONS[name];
  return name.startsWith(".") ? "hidden directory" : undefined;
}

/** Whether a repository-relative path sits inside a directory the walk skips. */
export function isInExcludedDirectory(path: string): boolean {
  return path
    .split("/")
    .slice(0, -1)
    .some((segment) => directoryExclusion(segment) !== undefined);
}

export function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSION.test(path);
}

export interface WalkResult {
  /** Candidates for parsing, sorted. */
  sourcePaths: string[];
  /** Includes package.json files, which also end up skipped as not-source. */
  packageJsonPaths: string[];
  skipped: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
}

/**
 * Selection is structural: a directory is kept or excluded whole, and there is
 * no cap by size or count. A cap would keep a file and drop the leaf it imports.
 */
export function walkRepository(root: string): WalkResult {
  const result: WalkResult = {
    sourcePaths: [],
    packageJsonPaths: [],
    skipped: [],
    excludedDirectories: [],
  };

  // Iterative so a deeply nested repository can't exhaust the call stack.
  const pending = [""];
  for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
    const absolute = directory === "" ? root : `${root}/${directory}`;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        // Not followed: it could leave the repository or loop back into it.
        result.skipped.push({ path, reason: "symlink", detail: "symbolic link, not followed" });
      } else if (entry.isDirectory()) {
        const reason = directoryExclusion(entry.name);
        if (reason) result.excludedDirectories.push({ path, reason });
        else pending.push(path);
      } else if (entry.isFile()) {
        if (entry.name === "package.json") result.packageJsonPaths.push(path);
        if (isSourceFile(path)) {
          result.sourcePaths.push(path);
        } else {
          const extension = /\.[^./]+$/.exec(entry.name)?.[0];
          result.skipped.push({
            path,
            reason: "not-source",
            detail: extension ? `${extension} is not TypeScript or JavaScript` : "no file extension",
          });
        }
      } else {
        result.skipped.push({ path, reason: "unreadable", detail: "not a regular file" });
      }
    }
  }
  return result;
}
