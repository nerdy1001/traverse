// What more than one adapter needs: reading a repository's structure, and the roles
// that mean the same thing whatever the framework.

import { posix } from "node:path";
import { ts } from "ts-morph";
import type { Role } from "../../lib/map/taxonomy.ts";
import type { Repository } from "./types.ts";

const SOURCE = String.raw`\.[cm]?[jt]sx?$`;

const DECLARATION = /\.d\.[cm]?ts$/;
const TEST = new RegExp(
  String.raw`(^|/)(tests?|__tests__|__mocks__)/|(^|[/.])(test|spec)${SOURCE}|(^|/)setupTests${SOURCE}`,
);
const CONFIG = new RegExp(String.raw`(^|/)[^/]+\.config${SOURCE}|(^|/)\.[^/]+rc${SOURCE}`);

/** Most specific purpose first: a test beside a page is a test. */
export function plumbingRole(path: string): Role | undefined {
  if (DECLARATION.test(path)) return "declaration";
  if (TEST.test(path)) return "test";
  if (CONFIG.test(path)) return "config";
  return undefined;
}

// A library's examples/next-app/package.json doesn't make the library a Next.js
// application, and a fixture's controller isn't a route the repository serves.
const NOT_THE_APPLICATION =
  /(^|\/)(examples?|samples?|fixtures?|__fixtures__|templates?|demos?|tests?|__tests__|e2e|playgrounds?|benchmarks?)(\/|$)/;

export function isOutsideApplication(path: string): boolean {
  return NOT_THE_APPLICATION.test(path);
}

export function isUnder(directory: string, path: string): boolean {
  return directory === "." || path.startsWith(`${directory}/`);
}

/** The application packages declaring any of these dependencies. */
export function directoriesDeclaring(repository: Repository, dependencies: readonly string[]): string[] {
  return repository.packages
    .filter(
      ({ directory, dependencies: declared }) =>
        !isOutsideApplication(directory) && dependencies.some((name) => declared.has(name)),
    )
    .map(({ directory }) => directory);
}

export function stemOf(path: string): string {
  return posix.basename(path).replace(/\.[^.]+$/, "");
}

/** Shared by the two adapters that have components, which is most of what React needs. */
export function interfaceRole(path: string): Role | undefined {
  const stem = stemOf(path);
  const folders = path.split("/").slice(0, -1);
  if (/^use[A-Z0-9]/.test(stem) || folders.includes("hooks")) return "hook";
  if (/\.[jt]sx$/.test(path) || folders.includes("components")) return "component";
  return undefined;
}

export function lineOf(node: ts.Node, source: ts.SourceFile): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/**
 * A string the syntax states: a literal, or a name for one that can only mean that
 * literal, because it's the file's single declaration of that name and is a const.
 * Anything else is a value known at runtime, and undefined.
 */
export function stringValue(node: ts.Node, source: ts.SourceFile): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (!ts.isIdentifier(node)) return undefined;

  const initializers: (ts.Expression | undefined)[] = [];
  let ambiguous = false;
  const visit = (current: ts.Node) => {
    if (ts.isVariableDeclarationList(current)) {
      for (const declaration of current.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === node.text) {
          if (current.flags & ts.NodeFlags.Const) initializers.push(declaration.initializer);
          else ambiguous = true;
        }
      }
    } else if (
      (ts.isParameter(current) || ts.isBindingElement(current)) &&
      ts.isIdentifier(current.name) &&
      current.name.text === node.text
    ) {
      ambiguous = true;
    }
    ts.forEachChild(current, visit);
  };
  visit(source);

  const [initializer] = initializers;
  return !ambiguous && initializers.length === 1 && initializer && ts.isStringLiteralLike(initializer)
    ? initializer.text
    : undefined;
}
