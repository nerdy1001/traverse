import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, posix } from "node:path";
import { Project, type SourceFile } from "ts-morph";
import { selectAdapter } from "./adapters/index.ts";
import { readCommonJsExports } from "./commonjs.ts";
import { computeFan, dedupeEdges } from "./graph.ts";
import { readImports } from "./imports.ts";
import { createResolver } from "./resolve.ts";
import type {
  Coverage,
  FileNode,
  ImportCounts,
  ImportExample,
  ImportKind,
  ParseResult,
  SkipReason,
  SkippedFile,
  UnresolvedReason,
} from "./types.ts";
import { walkRepository, type WalkResult } from "./walk.ts";

// Past this a file is almost always generated or bundled, and it would dominate
// parsing time. It is reported as skipped, so imports of it are reported too.
const MAX_FILE_BYTES = 1024 * 1024;
const EXAMPLES_PER_REASON = 20;

function emptyCounts(): ImportCounts {
  return {
    seen: 0,
    resolved: 0,
    external: 0,
    excluded: 0,
    unresolved: 0,
    excludedBy: { "non-source-target": 0, "skipped-target": 0, "excluded-directory-target": 0 },
    unresolvedBy: {
      "file-not-found": 0,
      "case-mismatch": 0,
      "alias-target-not-found": 0,
      "unknown-alias": 0,
      "undeclared-package": 0,
      "workspace-entry-not-found": 0,
      "non-literal-dynamic-import": 0,
    },
  };
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const breaks = text.match(/\n/g)?.length ?? 0;
  return text.endsWith("\n") ? breaks : breaks + 1;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byPath<T extends { path: string }>(a: T, b: T): number {
  return compare(a.path, b.path);
}

/** Which files a repository has and which of them are worth parsing. */
export interface Selection {
  root: string;
  walk: WalkResult;
}

export function selectFiles(directory: string): Selection {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Not a directory: ${directory}`);
  }
  const root = realpathSync.native(directory).replaceAll("\\", "/");
  return { root, walk: walkRepository(root) };
}

/** Takes a directory, returns data. How the repository got onto disk isn't its concern. */
export function parseRepository(directory: string): ParseResult {
  return parseSelection(selectFiles(directory));
}

export function parseSelection({ root, walk }: Selection): ParseResult {
  const skipped: SkippedFile[] = [...walk.skipped];

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    // Parsing only. Nothing here is type-checked, so nothing else gets loaded.
    compilerOptions: { allowJs: true, noLib: true, noResolve: true },
  });

  const loaded: { path: string; lines: number; hash: string; source: SourceFile }[] = [];
  for (const path of walk.sourcePaths.sort()) {
    try {
      const bytes = readFileSync(`${root}/${path}`);
      if (bytes.length > MAX_FILE_BYTES) {
        skipped.push({ path, reason: "too-large", detail: `${bytes.length} bytes, the limit is ${MAX_FILE_BYTES}` });
        continue;
      }
      const text = bytes.toString("utf8");
      loaded.push({
        path,
        lines: countLines(text),
        hash: createHash("sha256").update(bytes).digest("hex"),
        source: project.createSourceFile(`${root}/${path}`, text, { overwrite: true }),
      });
    } catch (error) {
      skipped.push({ path, reason: "unreadable", detail: error instanceof Error ? error.message : String(error) });
    }
  }

  // A file the parser could only half read isn't a node: what it recovered
  // would be presented as what the file imports.
  const program = project.getProgram();
  const parsed = loaded.filter(({ path, source }) => {
    const [first] = program.getSyntacticDiagnostics(source);
    if (!first) return true;
    const message = first.getMessageText();
    const text = typeof message === "string" ? message : message.getMessageText();
    skipped.push({ path, reason: "syntax-error", detail: `line ${first.getLineNumber() ?? "?"}: ${text}` });
    return false;
  });

  const resolver = createResolver({
    root,
    nodePaths: parsed.map(({ path }) => path),
    skipped,
    packageJsonPaths: walk.packageJsonPaths,
  });

  const totals = emptyCounts();
  const byKind: Record<ImportKind, ImportCounts> = {
    import: emptyCounts(),
    "re-export": emptyCounts(),
    dynamic: emptyCounts(),
    require: emptyCounts(),
  };
  const examples: Record<UnresolvedReason, ImportExample[]> = {
    "file-not-found": [],
    "case-mismatch": [],
    "alias-target-not-found": [],
    "unknown-alias": [],
    "undeclared-package": [],
    "workspace-entry-not-found": [],
    "non-literal-dynamic-import": [],
  };
  const connections: { from: string; to: string; kind: ImportKind }[] = [];

  for (const { path, source } of parsed) {
    for (const site of readImports(source.compilerNode)) {
      const resolution =
        site.specifier === undefined
          ? ({
              status: "unresolved",
              reason: "non-literal-dynamic-import",
              // Shared with require: the same failure, and the example records which kind.
              detail: "the target is computed at runtime, so it can't be read from the code",
            } as const)
          : resolver.resolve(site.specifier, path);

      for (const counts of [totals, byKind[site.kind]]) {
        counts.seen += 1;
        counts[resolution.status] += 1;
        if (resolution.status === "excluded") counts.excludedBy[resolution.reason] += 1;
        if (resolution.status === "unresolved") counts.unresolvedBy[resolution.reason] += 1;
      }
      if (resolution.status === "resolved") {
        connections.push({ from: path, to: resolution.to, kind: site.kind });
      } else if (resolution.status === "unresolved" && examples[resolution.reason].length < EXAMPLES_PER_REASON) {
        examples[resolution.reason].push({
          from: path,
          line: site.line,
          kind: site.kind,
          specifier: site.specifier ?? site.text,
          reason: resolution.reason,
          detail: resolution.detail,
        });
      }
    }
  }

  const edges = dedupeEdges(connections);
  const repository = {
    files: parsed.map(({ path, source }) => ({ path, source: source.compilerNode })),
    packages: [...resolver.packages].map(([directory, { dependencies }]) => ({ directory, dependencies })),
  };
  const adapter = selectAdapter(repository);
  const reading = adapter.read(repository);
  const fan = computeFan(parsed.map(({ path }) => path), edges);
  const files: FileNode[] = parsed.map(({ path, lines, hash, source }) => ({
    path,
    folder: posix.dirname(path),
    role: reading.roleOf({ path, source: source.compilerNode }),
    lines,
    hash,
    fanIn: fan.get(path)?.fanIn ?? 0,
    fanOut: fan.get(path)?.fanOut ?? 0,
  }));

  skipped.sort(byPath);
  const skippedBy: Record<SkipReason, number> = {
    "not-source": 0,
    "too-large": 0,
    unreadable: 0,
    "syntax-error": 0,
    symlink: 0,
  };
  for (const { reason } of skipped) skippedBy[reason] += 1;

  const coverage: Coverage = {
    files: {
      found: files.length + skipped.length,
      parsed: files.length,
      skipped: skipped.length,
      skippedBy,
    },
    skippedFiles: skipped,
    excludedDirectories: walk.excludedDirectories.sort(byPath),
    imports: totals,
    importsByKind: byKind,
    unresolvedExamples: examples,
    configProblems: resolver.problems.sort(byPath),
    omittedRoutes: reading.omittedRoutes.sort((a, b) => byPath(a, b) || a.line - b.line),
  };

  // Literal arrays can state the same path twice. It's still one route.
  const routes = [...new Map(reading.routes.map((route) => [`${route.path}\0${route.method}\0${route.pattern}`, route])).values()];

  return {
    schemaVersion: 1,
    repository: { name: basename(root) },
    adapter: adapter.name,
    files,
    edges,
    commonJsExports: parsed.flatMap(({ path, source }) => {
      const read = readCommonJsExports(source.compilerNode);
      return read ? [{ path, ...read }] : [];
    }),
    routes: routes.sort((a, b) => compare(a.pattern, b.pattern) || compare(a.method, b.method) || byPath(a, b)),
    coverage,
  };
}
