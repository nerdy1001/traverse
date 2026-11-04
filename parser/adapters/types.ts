// Framework knowledge lives behind this interface and nowhere else in the parser.

import type { ts } from "ts-morph";
import type { Role } from "../../lib/map/taxonomy.ts";
import type { OmittedRoute, Route } from "../types.ts";

export interface RepositoryFile {
  path: string;
  source: ts.SourceFile;
}

export interface RepositoryPackage {
  /** Where its package.json sits, repository-relative. "." for the root. */
  directory: string;
  dependencies: ReadonlySet<string>;
}

export interface Repository {
  files: readonly RepositoryFile[];
  packages: readonly RepositoryPackage[];
}

export interface AdapterReading {
  roleOf(file: RepositoryFile): Role;
  routes: Route[];
  /** What looks like a route but couldn't be read exactly. Counted, never approximated. */
  omittedRoutes: OmittedRoute[];
}

export interface FrameworkAdapter {
  name: string;
  /** Whether this repository is the adapter's framework. */
  matches(repository: Repository): boolean;
  read(repository: Repository): AdapterReading;
}
