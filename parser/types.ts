// The parser's output. Everything built after the parser reads this shape, so
// it is a contract: derive what you need from it rather than reshaping it.

export type ImportKind = "import" | "re-export" | "dynamic";

export type SkipReason =
  | "not-source"
  | "too-large"
  | "unreadable"
  | "syntax-error"
  | "symlink";

/** The target is real but is deliberately not a node, so it gets no edge. */
export type ExcludedReason =
  | "non-source-target"
  | "skipped-target"
  | "excluded-directory-target";

export type UnresolvedReason =
  | "file-not-found"
  | "case-mismatch"
  | "alias-target-not-found"
  | "unknown-alias"
  | "undeclared-package"
  | "workspace-entry-not-found"
  | "non-literal-dynamic-import";

export interface FileNode {
  /** Repository-relative, forward slashes. The file's identity everywhere. */
  path: string;
  /** Directory holding the file, repository-relative. "." for the root. */
  folder: string;
  /** Given by the adapter. The fallback adapter gives every file "generic". */
  role: string;
  lines: number;
  /** SHA-256 of the file's bytes, hex. */
  hash: string;
  /** Distinct files with an edge into this one. */
  fanIn: number;
  /** Distinct files this one has an edge to. */
  fanOut: number;
}

/** One per connected pair of files, however many imports connect them. */
export interface Edge {
  from: string;
  to: string;
  kinds: ImportKind[];
}

// The coverage report is stored as JSON. These are type aliases rather than
// interfaces because only an alias is checked against the JSON column type, which
// proves at compile time that the report survives the round trip.
export type SkippedFile = {
  path: string;
  reason: SkipReason;
  detail: string;
};

/** A directory the walk did not enter, so its files are not counted as found. */
export type ExcludedDirectory = {
  path: string;
  reason: string;
};

export type ImportCounts = {
  /** Always resolved + external + excluded + unresolved. */
  seen: number;
  resolved: number;
  external: number;
  excluded: number;
  unresolved: number;
  excludedBy: Record<ExcludedReason, number>;
  unresolvedBy: Record<UnresolvedReason, number>;
};

export type ImportExample = {
  from: string;
  line: number;
  kind: ImportKind;
  specifier: string;
  reason: UnresolvedReason;
  detail: string;
};

export type ConfigProblem = {
  path: string;
  message: string;
};

export type Coverage = {
  /** Always found = parsed + skipped. */
  files: {
    found: number;
    parsed: number;
    skipped: number;
    skippedBy: Record<SkipReason, number>;
  };
  skippedFiles: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
  imports: ImportCounts;
  importsByKind: Record<ImportKind, ImportCounts>;
  /** The first examples per reason. The counts above hold the totals. */
  unresolvedExamples: Record<UnresolvedReason, ImportExample[]>;
  /** A broken tsconfig or package.json loses aliases, so it has to be visible. */
  configProblems: ConfigProblem[];
};

export interface ParseResult {
  schemaVersion: 1;
  repository: { name: string };
  adapter: string;
  files: FileNode[];
  edges: Edge[];
  coverage: Coverage;
}
