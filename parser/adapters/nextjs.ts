import { ts } from "ts-morph";
import type { Role } from "../../lib/map/taxonomy.ts";
import type { OmittedRoute, Route } from "../types.ts";
import {
  directoriesDeclaring,
  interfaceRole,
  isOutsideApplication,
  isUnder,
  lineOf,
  plumbingRole,
  stemOf,
} from "./shared.ts";
import type { FrameworkAdapter, Repository, RepositoryFile } from "./types.ts";

const HANDLER_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

// Next's default pageExtensions. Anything else in a router folder isn't routed.
const ROUTED_EXTENSION = /\.(tsx?|jsx?)$/;

const LAYOUT_FILES = new Set([
  "layout",
  "template",
  "loading",
  "error",
  "global-error",
  "not-found",
  "global-not-found",
  "default",
  "forbidden",
  "unauthorized",
]);
const METADATA_FILE = /^(sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\d*$/;
const ENTRY_FILES = new Set(["middleware", "proxy", "instrumentation", "instrumentation-client"]);
const PAGES_SPECIAL = new Set(["_app", "_document", "_error", "404", "500"]);
const PAGES_API = /^pages\/api(\/|\.[^/]+$)/;

// Each of these makes a URL something other than the file's path, so with one set the
// path alone isn't the full pattern. basePath could be prepended when it's a literal,
// but i18n and the others can't, and one rule is easier to trust.
const URL_CHANGING_OPTIONS = new Set(["basePath", "i18n", "pageExtensions", "trailingSlash"]);

interface Project {
  /** The package's directory, with a trailing slash. Empty for the repository root. */
  base: string;
  /** Where the router folders are: the package itself, or its src folder. */
  sourceRoot: string;
  /** Why no pattern in this project can be exact, if there's a reason. */
  blocked?: string;
}

function configOptionSet(source: ts.SourceFile): string | undefined {
  let found: string | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      URL_CHANGING_OPTIONS.has(node.name.text) &&
      // The values that say "leave it as it is".
      node.initializer.kind !== ts.SyntaxKind.FalseKeyword &&
      !(ts.isStringLiteralLike(node.initializer) && node.initializer.text === "")
    ) {
      found ??= node.name.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function projectsOf({ files, packages }: Repository): Project[] {
  const paths = files.map(({ path }) => path);
  const declaring = directoriesDeclaring({ files, packages }, ["next"]);
  return declaring
    .map((directory): Project => {
      const base = directory === "." ? "" : `${directory}/`;
      // Next ignores src/app and src/pages when either folder exists at the package root.
      const atRoot = paths.some((path) => path.startsWith(`${base}app/`) || path.startsWith(`${base}pages/`));
      const config = files.find(({ path }) => path.startsWith(base) && /^next\.config\.[cm]?[jt]s$/.test(path.slice(base.length)));
      const option = config && configOptionSet(config.source);
      return {
        base,
        sourceRoot: atRoot ? base : `${base}src/`,
        blocked: option && `${config.path} sets ${option}, which changes the URL`,
      };
    })
    .sort((a, b) => b.base.length - a.base.length);
}

function conventionRole(path: string, { sourceRoot }: Project): Role | undefined {
  if (!path.startsWith(sourceRoot)) return undefined;
  const relative = path.slice(sourceRoot.length);
  const stem = stemOf(relative);

  if (!relative.includes("/")) return ENTRY_FILES.has(stem) ? "entry-middleware" : undefined;
  if (!ROUTED_EXTENSION.test(relative)) return undefined;

  if (relative.startsWith("app/")) {
    const folders = relative.split("/").slice(1, -1);
    // Next's way of saying a folder is not part of routing.
    if (folders.some((folder) => folder.startsWith("_"))) return undefined;
    if (stem === "page") return "page-route";
    if (stem === "route") return "api-endpoint";
    if (LAYOUT_FILES.has(stem)) return "layout";
    if (METADATA_FILE.test(stem)) return "metadata";
    return undefined;
  }
  if (relative.startsWith("pages/")) {
    if (PAGES_API.test(relative)) return "api-endpoint";
    if (relative.split("/").length === 2 && PAGES_SPECIAL.has(stem)) return "layout";
    return "page-route";
  }
  return undefined;
}

function isUseServerFile(source: ts.SourceFile): boolean {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === "use server") return true;
  }
  return false;
}

function bindingNames(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  );
}

function isExported(statement: ts.Statement, keyword: ts.SyntaxKind = ts.SyntaxKind.ExportKeyword): boolean {
  return (
    ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === keyword)
  );
}

interface Exports {
  /** Exported name to the node that exports it. Whatever form the export takes. */
  names: Map<string, ts.Node>;
  /** `export * from`, which could add any name without saying so. */
  hasStar: boolean;
}

function readExports(source: ts.SourceFile): Exports {
  const names = new Map<string, ts.Node>();
  let hasStar = false;
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals) names.set("default", statement);
    } else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (isExported(statement, ts.SyntaxKind.DefaultKeyword)) names.set("default", statement);
      else if (isExported(statement) && statement.name) names.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      if (!isExported(statement)) continue;
      // Binding patterns as well: `export const { GET, POST } = handlers` is common.
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) names.set(name.text, name);
      }
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (!statement.exportClause) hasStar = true;
      else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) names.set(element.name.text, element);
        }
      }
    }
  }
  return { names, hasStar };
}

type Pattern = { pattern: string } | { reason: string };

function appPattern(relative: string): Pattern {
  const kept: string[] = [];
  for (const folder of relative.split("/").slice(1, -1)) {
    if (folder.startsWith("@")) return { reason: "a parallel route slot renders inside its parent's URL" };
    if (folder.startsWith("(.")) return { reason: "an intercepting route's URL belongs to the route it intercepts" };
    if (folder.includes("%")) return { reason: "a percent-encoded folder name" };
    // A route group shapes layouts and takes no part in the URL.
    if (!/^\(.*\)$/.test(folder)) kept.push(folder);
  }
  return { pattern: `/${kept.join("/")}` };
}

function pagesPattern(relative: string): Pattern {
  const segments = relative.replace(ROUTED_EXTENSION, "").split("/").slice(1);
  if (segments.at(-1) === "index") segments.pop();
  return { pattern: `/${segments.join("/")}` };
}

function readFileRoutes(
  { path, source }: RepositoryFile,
  role: Role,
  { sourceRoot, blocked }: Project,
  routes: Route[],
  omitted: OmittedRoute[],
): void {
  const omit = (reason: string, line = 1) => omitted.push({ path, line, reason });
  if (blocked) return void omit(blocked);

  const relative = path.slice(sourceRoot.length);
  const { names, hasStar } = readExports(source);

  if (PAGES_API.test(relative)) {
    const handler = names.get("default");
    return void omit(
      "a pages/api handler decides its method at runtime, inside the function",
      handler ? lineOf(handler, source) : 1,
    );
  }

  const found = relative.startsWith("app/") ? appPattern(relative) : pagesPattern(relative);
  if ("reason" in found) return void omit(found.reason);
  const { pattern } = found;

  if (role === "page-route") {
    // A page is what Next serves for a GET of its URL. That's what the file means by
    // being a page, not a guess about it. Without a default export it serves nothing.
    const page = names.get("default");
    if (!page) return void omit("no default export that can be read from this file");
    routes.push({ method: "GET", pattern, path, line: lineOf(page, source) });
    return;
  }

  const handlers = [...names].filter(([name]) => HANDLER_METHODS.has(name));
  for (const [method, node] of handlers) routes.push({ method, pattern, path, line: lineOf(node, source) });
  if (hasStar) omit("export * could add more methods than the file names");
  else if (handlers.length === 0) omit("exports no HTTP method by name");
}

export const nextjsAdapter: FrameworkAdapter = {
  name: "nextjs",
  // Declaring next isn't enough: a library can test against it and route nothing.
  matches(repository) {
    const projects = projectsOf(repository);
    return repository.files.some(({ path }) => {
      if (plumbingRole(path)) return false;
      const role = projects.map((project) => conventionRole(path, project)).find(Boolean);
      return role === "page-route" || role === "api-endpoint";
    });
  },
  read(repository) {
    const projects = projectsOf(repository);
    const interfaceDirectories = directoriesDeclaring(repository, ["next", "react"]);

    const roleOf = ({ path, source }: RepositoryFile): Role => {
      const plumbing = plumbingRole(path);
      if (plumbing) return plumbing;
      if (isOutsideApplication(path)) return "generic";
      const project = projects.find(({ base }) => path.startsWith(base));
      const convention = project && conventionRole(path, project);
      if (convention) return convention;
      // There's no path convention for these. The directive is what makes one, so a
      // file called actions.ts without it stays what it is.
      if (project && isUseServerFile(source)) return "server-action";
      return interfaceDirectories.some((directory) => isUnder(directory, path))
        ? (interfaceRole(path) ?? "generic")
        : "generic";
    };

    const routes: Route[] = [];
    const omittedRoutes: OmittedRoute[] = [];
    for (const file of repository.files) {
      const role = roleOf(file);
      const project = projects.find(({ base }) => file.path.startsWith(base));
      if (project && (role === "page-route" || role === "api-endpoint")) {
        readFileRoutes(file, role, project, routes, omittedRoutes);
      } else if (project && role === "metadata") {
        omittedRoutes.push({
          path: file.path,
          line: 1,
          reason: "a metadata file's URL depends on its contents and what it generates",
        });
      }
    }
    return { roleOf, routes, omittedRoutes };
  },
};
