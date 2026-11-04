// The rail's arithmetic over the roles the adapters gave. What the roles are, and in
// what order they read, lives in the taxonomy.

import type { FileNode } from "../../parser/types.ts";
import type { Folding } from "./fold.ts";
import { ROLES, type Role, rolesFor } from "./taxonomy.ts";

export interface CategoryCount {
  role: Role;
  name: string;
  swatch: string;
  count: number;
}

/** Every category of this framework in reading order, including those holding no file. */
export function countByCategory(files: readonly FileNode[], adapter: string): CategoryCount[] {
  const roles = rolesFor(adapter);
  const counts = new Map<Role, number>();
  for (const { path, role } of files) {
    // It would be on the map and in no category, so the counts wouldn't add up.
    if (!roles.includes(role)) throw new Error(`${path} has the role "${role}", which ${adapter} doesn't list`);
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return roles.map((role) => ({
    role,
    name: ROLES[role].name,
    swatch: ROLES[role].swatch,
    count: counts.get(role) ?? 0,
  }));
}

export interface CategoryMatch {
  files: ReadonlySet<string>;
  /** Per box, so every file in the category is counted somewhere on the map. */
  countByFolder: ReadonlyMap<string, number>;
}

export function matchCategory(files: readonly FileNode[], folding: Folding, category: Role): CategoryMatch {
  const matched = new Set(files.filter(({ role }) => role === category).map(({ path }) => path));
  return {
    files: matched,
    countByFolder: new Map(
      folding.nodes.map((node) => [node.directory, node.files.filter((path) => matched.has(path)).length]),
    ),
  };
}
