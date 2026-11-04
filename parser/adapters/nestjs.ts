import { ts } from "ts-morph";
import type { Role } from "../../lib/map/taxonomy.ts";
import type { OmittedRoute, Route } from "../types.ts";
import { directoriesDeclaring, isOutsideApplication, isUnder, lineOf, plumbingRole, stringValue } from "./shared.ts";
import type { FrameworkAdapter, Repository, RepositoryFile } from "./types.ts";

const NEST_PACKAGES = ["@nestjs/core", "@nestjs/common"];

const SUFFIX_ROLES: Readonly<Record<string, Role>> = {
  controller: "controller",
  gateway: "gateway",
  resolver: "resolver",
  service: "service",
  repository: "repository",
  module: "module",
  entity: "entity",
  schema: "schema",
  dto: "dto",
  guard: "guard",
  interceptor: "interceptor",
  pipe: "pipe",
  filter: "filter",
  middleware: "class-middleware",
};
const SUFFIX = /\.([a-z]+)\.[cm]?[jt]s$/;

const METHOD_DECORATORS: Readonly<Record<string, string>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Delete: "DELETE",
  Patch: "PATCH",
  Options: "OPTIONS",
  Head: "HEAD",
  Search: "SEARCH",
  All: "ALL",
};
// Handlers too, but what they serve isn't stated by the decorator's name.
const UNREADABLE_DECORATORS = new Set(["RequestMapping", "Sse"]);

/** What every controller's path sits under, or why that can't be known. */
type GlobalPrefix = { value: string } | { reason: string };

/** Local names of what this file imports from Nest, so `Get as Fetch` still reads. */
function nestImports(source: ts.SourceFile): Map<string, string> {
  const names = new Map<string, string>();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "@nestjs/common" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        names.set(element.name.text, (element.propertyName ?? element.name).text);
      }
    }
  }
  return names;
}

interface ReadDecorator {
  name: string;
  node: ts.Decorator;
  arguments: readonly ts.Expression[];
}

function readDecorators(node: ts.HasDecorators, imports: ReadonlyMap<string, string>): ReadDecorator[] {
  return (ts.getDecorators(node) ?? []).flatMap((decorator): ReadDecorator[] => {
    const call = decorator.expression;
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return [];
    const name = imports.get(call.expression.text);
    return name ? [{ name, node: decorator, arguments: call.arguments }] : [];
  });
}

/** Paths stated by a decorator's argument. Undefined if the syntax doesn't state them. */
function readPaths(argument: ts.Expression | undefined, source: ts.SourceFile): string[] | undefined {
  if (argument === undefined) return [""];
  if (ts.isArrayLiteralExpression(argument)) {
    const paths = argument.elements.map((element) => stringValue(element, source));
    return paths.every((path) => path !== undefined) ? paths : undefined;
  }
  const value = stringValue(argument, source);
  return value === undefined ? undefined : [value];
}

/** Controller options can move a route: host and version aren't in the path it states. */
function readControllerPaths(argument: ts.Expression | undefined, source: ts.SourceFile): string[] | undefined {
  if (!argument || !ts.isObjectLiteralExpression(argument)) return readPaths(argument, source);
  let path: ts.Expression | undefined;
  for (const property of argument.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) return undefined;
    if (property.name.text === "path") path = property.initializer;
    else if (property.name.text !== "scope" && property.name.text !== "durable") return undefined;
  }
  return readPaths(path, source);
}

/** The way Nest joins them: repeated and trailing slashes don't survive. */
function joinPattern(...parts: readonly string[]): string {
  return `/${parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    .join("/")}`;
}

function readController(
  { path, source }: RepositoryFile,
  controller: ts.ClassDeclaration,
  prefix: GlobalPrefix,
  routes: Route[],
  omitted: OmittedRoute[],
): void {
  const imports = nestImports(source);
  const classDecorators = readDecorators(controller, imports);
  const decorator = classDecorators.find(({ name }) => name === "Controller");
  const classVersioned = classDecorators.some(({ name }) => name === "Version");

  for (const member of controller.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    const decorators = readDecorators(member, imports);
    const handlers = decorators.filter(({ name }) => name in METHOD_DECORATORS || UNREADABLE_DECORATORS.has(name));
    const [handler] = handlers;
    if (!handler) continue;

    const line = lineOf(handler.node, source);
    const omit = (reason: string) => omitted.push({ path, line, reason });

    if (!decorator) {
      omit("the class has no @Controller, so its path comes from whatever extends it at runtime");
    } else if ("reason" in prefix) {
      omit(prefix.reason);
    } else if (handlers.length > 1) {
      omit("more than one HTTP decorator on one method");
    } else if (UNREADABLE_DECORATORS.has(handler.name)) {
      omit(`@${handler.name} doesn't state its method by name`);
    } else if (classVersioned || decorators.some(({ name }) => name === "Version")) {
      omit("@Version adds to the path according to how versioning is set up");
    } else {
      const controllerPaths = readControllerPaths(decorator.arguments[0], source);
      const methodPaths = readPaths(handler.arguments[0], source);
      if (!controllerPaths) omit("the @Controller path or its options aren't stated in the code");
      else if (!methodPaths) omit(`the @${handler.name} path isn't stated in the code`);
      else {
        for (const controllerPath of controllerPaths) {
          for (const methodPath of methodPaths) {
            routes.push({
              method: METHOD_DECORATORS[handler.name],
              pattern: joinPattern(prefix.value, controllerPath, methodPath),
              path,
              line,
            });
          }
        }
      }
    }
  }
}

/**
 * A controller's decorators only give its full pattern if nothing puts more in front
 * of it. So what bootstrapping does is read too, and anything it does that can't be
 * read exactly means no pattern in the repository is exact.
 */
function readGlobalPrefix(files: readonly RepositoryFile[]): GlobalPrefix {
  const prefixes = new Set<string>();
  let applications = 0;
  let prefixCalls = 0;
  let reason: string | undefined;

  for (const { path, source } of files) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const on = node.expression.expression;
        const where = `${path}:${lineOf(node, source)}`;
        if (method === "setGlobalPrefix") {
          prefixCalls += 1;
          const [argument] = node.arguments;
          const value = argument && node.arguments.length === 1 ? stringValue(argument, source) : undefined;
          if (value === undefined) reason ??= `the global prefix at ${where} isn't a plain string in the code`;
          else prefixes.add(value);
        } else if (method === "enableVersioning") {
          reason ??= `versioning is enabled at ${where}, which adds to paths`;
        } else if (ts.isIdentifier(on) && on.text === "RouterModule") {
          reason ??= `RouterModule at ${where} adds to paths`;
        } else if (ts.isIdentifier(on) && on.text === "NestFactory" && method === "create") {
          applications += 1;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  if (reason) return { reason };
  if (prefixCalls === 0) return { value: "" };
  // One prefix and several applications: which ones it applies to isn't in the syntax.
  if (prefixes.size > 1 || applications > 1) return { reason: "several applications set or share a global prefix" };
  return { value: [...prefixes][0] };
}

function applicationFiles(repository: Repository): RepositoryFile[] {
  const directories = directoriesDeclaring(repository, NEST_PACKAGES);
  return repository.files.filter(
    ({ path }) =>
      !plumbingRole(path) && !isOutsideApplication(path) && directories.some((directory) => isUnder(directory, path)),
  );
}

export const nestjsAdapter: FrameworkAdapter = {
  name: "nestjs",
  matches: (repository) => directoriesDeclaring(repository, NEST_PACKAGES).length > 0,
  read(repository) {
    const files = applicationFiles(repository);
    const inApplication = new Set(files.map(({ path }) => path));
    const prefix = readGlobalPrefix(files);

    const routes: Route[] = [];
    const omittedRoutes: OmittedRoute[] = [];
    for (const file of files) {
      const visit = (node: ts.Node) => {
        if (ts.isClassDeclaration(node)) readController(file, node, prefix, routes, omittedRoutes);
        ts.forEachChild(node, visit);
      };
      visit(file.source);
    }

    return {
      roleOf({ path }) {
        const plumbing = plumbingRole(path);
        if (plumbing) return plumbing;
        if (!inApplication.has(path)) return "generic";
        const suffix = SUFFIX.exec(path)?.[1];
        return suffix !== undefined && Object.hasOwn(SUFFIX_ROLES, suffix) ? SUFFIX_ROLES[suffix] : "generic";
      },
      routes,
      omittedRoutes,
    };
  },
};
