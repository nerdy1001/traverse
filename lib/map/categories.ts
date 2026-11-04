// What kind of file this is, read from its path. Every file is "generic" until
// adapters give real roles, and the rail and the insights can't wait for that.
// Sits outside the parser because it is framework knowledge, and applies per file
// rather than per repository because a framework can live in one nested folder.

import type { FileNode } from "../../parser/types.ts";
import type { Folding } from "./fold.ts";

const SOURCE = String.raw`\.[cm]?[jt]sx?$`;

const DECLARATION = /\.d\.[cm]?ts$/;
const TEST = new RegExp(
  String.raw`(^|/)(tests?|__tests__|__mocks__)/|(^|[/.])(test|spec)${SOURCE}|(^|/)setupTests${SOURCE}`,
);
const CONFIG = new RegExp(String.raw`(^|/)[^/]+\.config${SOURCE}|(^|/)\.[^/]+rc${SOURCE}`);
const MIDDLEWARE = new RegExp(String.raw`(^|/)(middleware|proxy|instrumentation)${SOURCE}`);
// Tied to an app or pages folder: a component that happens to be called page.tsx
// is reached by an import, and has to be reported if nothing imports it.
const APP_PAGE = new RegExp(String.raw`(^|/)app/(.*/)?(page|route)${SOURCE}`);
const PAGES_FOLDER = new RegExp(String.raw`(^|/)pages/.*${SOURCE}`);
const APP_LAYOUT = new RegExp(
  String.raw`(^|/)app/(.*/)?(layout|template|loading|error|global-error|not-found|default)${SOURCE}`,
);

/** Reading order, and it stays fixed: what's routable, what's behind it, then plumbing. */
export const CATEGORIES = [
  { name: "Pages & routes", swatch: "bg-role-page" },
  { name: "Layouts", swatch: "bg-role-layout" },
  { name: "Middleware", swatch: "bg-role-middleware" },
  { name: "Generic", swatch: "bg-role-generic" },
  { name: "Config", swatch: "bg-role-config" },
  { name: "Tests", swatch: "bg-role-test" },
  { name: "Declarations", swatch: "bg-role-declaration" },
] as const;

export type CategoryName = (typeof CATEGORIES)[number]["name"];

export const UNIDENTIFIED: CategoryName = "Generic";

export function categoryOf(path: string): CategoryName {
  // Most specific purpose first: a test beside a page is a test.
  if (DECLARATION.test(path)) return "Declarations";
  if (TEST.test(path)) return "Tests";
  if (CONFIG.test(path)) return "Config";
  if (MIDDLEWARE.test(path)) return "Middleware";
  if (APP_LAYOUT.test(path)) return "Layouts";
  if (APP_PAGE.test(path) || PAGES_FOLDER.test(path)) return "Pages & routes";
  return UNIDENTIFIED;
}

/** Categories holding no file are left out: a zero would only be noise in the rail. */
export function countByCategory(
  files: readonly FileNode[],
): { name: CategoryName; swatch: string; count: number }[] {
  const counts = new Map<CategoryName, number>();
  for (const { path } of files) {
    const name = categoryOf(path);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return CATEGORIES.flatMap(({ name, swatch }) => {
    const count = counts.get(name);
    return count === undefined ? [] : [{ name, swatch, count }];
  });
}

export interface CategoryMatch {
  files: ReadonlySet<string>;
  /** Per box, so every file in the category is counted somewhere on the map. */
  countByFolder: ReadonlyMap<string, number>;
}

export function matchCategory(
  files: readonly FileNode[],
  folding: Folding,
  category: CategoryName,
): CategoryMatch {
  const matched = new Set(files.map(({ path }) => path).filter((path) => categoryOf(path) === category));
  return {
    files: matched,
    countByFolder: new Map(
      folding.nodes.map((node) => [node.directory, node.files.filter((path) => matched.has(path)).length]),
    ),
  };
}
