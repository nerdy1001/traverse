// What the app's read-only surface answers, one shape per tool. The app computes
// every one of these with the same functions that draw the canvas; this side only
// carries them to the model. Nothing here names an analysis: the app reads that
// from the signed credential, so no request the model shapes can point elsewhere.

/** Reached by convention or by import, as the parser recorded it. */
export interface FileEntry {
  path: string;
  role: string;
}

/** A list the app may cut short. `total` is how many matched before the cut. */
export interface FileList {
  total: number;
  files: FileEntry[];
}

export interface Summary {
  framework: string;
  files: number;
  connections: number;
  routes: number;
  /** Every role present in this repository, so the model asks for roles that exist. */
  roles: { role: string; count: number }[];
  mostImported: (FileEntry & { importedBy: number })[];
  /** How many files anything imports, so the ranking above says what it was cut from. */
  importedCount: number;
  nothingImports: FileList;
  /** Files no convention identified, including those a model gave a role to. */
  unidentifiedCount: number;
  /** What the parser couldn't see, so an answer can say where the map has gaps. */
  coverage: {
    filesFound: number;
    filesSkipped: number;
    importsSeen: number;
    importsUnresolved: number;
  };
}

export interface Neighbours extends FileEntry {
  dependsOn: string[];
  dependents: string[];
}

export interface Walk extends FileEntry {
  direction: "dependents" | "dependencies";
  /** The walk's own limit, reported so the answer can say how far it looked. */
  maxDepth: number;
  reached: { path: string; depth: number }[];
}

export interface RouteTable {
  routes: { method: string; pattern: string; path: string; line: number }[];
  /** Looked like routes but couldn't be read exactly, so they're absent above. */
  omitted: number;
}
