import { readFileSync, realpathSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { posix, resolve as resolvePath } from "node:path";
import { ts } from "ts-morph";
import type {
  ConfigProblem,
  ExcludedReason,
  SkippedFile,
  UnresolvedReason,
} from "./types.ts";
import { isInExcludedDirectory } from "./walk.ts";

export type Resolution =
  | { status: "resolved"; to: string }
  | { status: "external" }
  | { status: "excluded"; reason: ExcludedReason }
  | { status: "unresolved"; reason: UnresolvedReason; detail: string };

export interface ResolverInput {
  /** Absolute, forward slashes. */
  root: string;
  nodePaths: readonly string[];
  skipped: readonly SkippedFile[];
  packageJsonPaths: readonly string[];
}

interface Config {
  options: ts.CompilerOptions;
  cache: ts.ModuleResolutionCache;
  workspaceCache: ts.ModuleResolutionCache;
}

interface PackageFacts {
  name: string | undefined;
  dependencies: Set<string>;
}

const BUILTINS = new Set(builtinModules);
const NO_INPUTS_ERRORS = new Set([18002, 18003]);
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const PACKAGE_NAME = /^(@[a-zA-Z0-9~-][a-zA-Z0-9._~-]*\/)?[a-zA-Z0-9~-][a-zA-Z0-9._~-]*/;

const toPosix = (path: string) => path.replaceAll("\\", "/");

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

function messageOf(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** "@scope/name/sub" -> "@scope/name", or undefined if it can't be a package. */
function packageNameOf(specifier: string): string | undefined {
  const match = PACKAGE_NAME.exec(specifier);
  if (!match || !/^(\/|$)/.test(specifier.slice(match[0].length))) return undefined;
  return match[0] === "~" ? undefined : match[0];
}

function typesPackageFor(name: string): string {
  return name.startsWith("@")
    ? `@types/${name.slice(1).replace("/", "__")}`
    : `@types/${name}`;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function readJsonObject(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parsed !== null && typeof parsed === "object" ? { ...parsed } : {};
}

/** The workspace patterns a repository declares, wherever its tool keeps them. */
function readWorkspacePatterns(
  root: string,
  manifest: Record<string, unknown> | undefined,
  problems: ConfigProblem[],
): string[] {
  const declared = manifest?.workspaces;
  const patterns = Array.isArray(declared)
    ? asStrings(declared)
    : declared !== null && typeof declared === "object" && declared !== undefined && "packages" in declared
      ? asStrings(declared.packages)
      : [];

  if (isFile(`${root}/lerna.json`)) {
    try {
      patterns.push(...asStrings(readJsonObject(`${root}/lerna.json`).packages));
    } catch (error) {
      problems.push({ path: "lerna.json", message: errorMessage(error) });
    }
  }

  if (isFile(`${root}/pnpm-workspace.yaml`)) {
    // Only this one flat list is needed, which doesn't justify a YAML parser.
    let inPackages = false;
    for (const line of readFileSync(`${root}/pnpm-workspace.yaml`, "utf8").split(/\r?\n/)) {
      if (/^\S/.test(line)) inPackages = /^packages\s*:/.test(line);
      const item = inPackages ? /^\s*-\s*['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(line) : null;
      if (item) patterns.push(item[1]);
    }
  }
  return patterns;
}

function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/?|\*/g, (star) => (star === "*" ? "[^/]*" : ".*"));
  return new RegExp(`^${source}$`);
}

export function createResolver(input: ResolverInput) {
  const { root } = input;
  const problems: ConfigProblem[] = [];

  const nodes = new Set(input.nodePaths);
  const skippedByPath = new Map(input.skipped.map((file) => [file.path, file]));
  const knownByLowerCase = new Map(
    [...input.nodePaths, ...skippedByPath.keys()].map((path) => [path.toLowerCase(), path]),
  );

  const relativeToRoot = (absolute: string): string | undefined =>
    absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : undefined;

  // ---- package.json facts --------------------------------------------------

  const packages = new Map<string, PackageFacts>();
  let rootManifest: Record<string, unknown> | undefined;
  for (const path of input.packageJsonPaths) {
    const directory = posix.dirname(path);
    try {
      const manifest = readJsonObject(`${root}/${path}`);
      if (directory === ".") rootManifest = manifest;
      const dependencies = new Set<string>();
      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const declared = manifest[field];
        if (declared !== null && typeof declared === "object" && declared !== undefined) {
          for (const name of Object.keys(declared)) dependencies.add(name);
        }
      }
      const name = typeof manifest.name === "string" ? manifest.name : undefined;
      packages.set(directory, { name, dependencies });
    } catch (error) {
      problems.push({ path, message: errorMessage(error) });
    }
  }

  // A package.json name alone proves nothing: a fixture called "fastify" is not
  // the fastify everyone imports. Only a package the repository declares as a
  // workspace member is reachable by name, and only from inside the workspace.
  const patterns = readWorkspacePatterns(root, rootManifest, problems);
  const included = patterns.filter((pattern) => !pattern.startsWith("!")).map(globToRegExp);
  const omitted = patterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => globToRegExp(pattern.slice(1)));
  const isMember = (directory: string) =>
    included.some((pattern) => pattern.test(directory)) &&
    !omitted.some((pattern) => pattern.test(directory));

  const workspaces = new Map<string, string>();
  for (const [directory, { name }] of packages) {
    if (name && directory !== "." && isMember(directory)) workspaces.set(name, `${root}/${directory}`);
  }
  const workspaceScopes = new Set(
    [...workspaces.keys()].filter((name) => name.startsWith("@")).map((name) => name.split("/")[0]),
  );

  const isInWorkspace = (fromDirectory: string): boolean => {
    for (let directory = fromDirectory; directory !== "."; directory = posix.dirname(directory)) {
      if (packages.has(directory)) return isMember(directory);
    }
    return true;
  };

  // ---- file access as the TypeScript resolver sees it ----------------------

  const realpath = (path: string): string => {
    // Only inside node_modules. Doing this everywhere would make a miscased
    // import on Windows look correct, hiding a failure on every other OS.
    if (!path.includes("/node_modules/")) return path;
    try {
      return toPosix(realpathSync.native(path));
    } catch {
      return path;
    }
  };

  const plainHost: ts.ModuleResolutionHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    getCurrentDirectory: () => root,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    realpath,
  };

  // A workspace member is reachable by name whether or not anything has been
  // installed, so its name is mapped to its real directory. The resolver then
  // follows that package's own exports and main, as it would for an installed
  // one. A fresh clone has no node_modules; without this, every cross-package
  // import in a monorepo would look external.
  const workspacePathOf = (path: string): string | undefined => {
    const marker = path.lastIndexOf("/node_modules/");
    if (marker === -1) return undefined;
    const rest = path.slice(marker + "/node_modules/".length);
    const name = packageNameOf(rest);
    if (!name) return undefined;
    const directory = workspaces.get(name);
    return directory === undefined ? undefined : directory + rest.slice(name.length);
  };

  const workspaceHost: ts.ModuleResolutionHost & ts.ParseConfigHost = {
    ...plainHost,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: () => [], // Only compiler options are wanted, not its file list.
    fileExists: (path) => ts.sys.fileExists(workspacePathOf(path) ?? path),
    readFile: (path) => ts.sys.readFile(workspacePathOf(path) ?? path),
    directoryExists: (path) => {
      if (path.endsWith("/node_modules")) return true;
      const last = posix.basename(path);
      if (workspaceScopes.has(last) && path.endsWith(`/node_modules/${last}`)) return true;
      return ts.sys.directoryExists(workspacePathOf(path) ?? path);
    },
    realpath: (path) => workspacePathOf(path) ?? realpath(path),
  };

  // ---- tsconfig ------------------------------------------------------------

  const withResolverDefaults = (options: ts.CompilerOptions): ts.CompilerOptions => ({
    ...options,
    // JavaScript files are nodes here, whatever the project's own compile does.
    allowJs: true,
    resolveJsonModule: true,
    // TypeScript's default for `module: esnext` alone is Classic, which ignores
    // node_modules and index files. Such projects are run through a bundler.
    moduleResolution:
      options.moduleResolution === undefined ||
      options.moduleResolution === ts.ModuleResolutionKind.Classic
        ? ts.ModuleResolutionKind.Bundler
        : options.moduleResolution,
  });

  const makeConfig = (options: ts.CompilerOptions, directory: string): Config => ({
    options,
    cache: ts.createModuleResolutionCache(directory, (name) => name, options),
    workspaceCache: ts.createModuleResolutionCache(directory, (name) => name, options),
  });

  const defaultConfig = makeConfig(withResolverDefaults({}), root);
  const loadedConfigs = new Map<string, { config: Config; references: string[] } | null>();

  const loadConfig = (path: string) => {
    const known = loadedConfigs.get(path);
    if (known !== undefined) return known;

    // Absolute paths stripped so the same repository writes the same output anywhere.
    const report = (message: string) =>
      problems.push({ path: relativeToRoot(path) ?? path, message: message.replaceAll(`${root}/`, "") });
    const { config, error } = ts.readConfigFile(path, workspaceHost.readFile);
    if (error) {
      report(messageOf(error));
      loadedConfigs.set(path, null);
      return null;
    }
    const parsed = ts.parseJsonConfigFileContent(config, workspaceHost, posix.dirname(path), undefined, path);
    for (const problem of parsed.errors) {
      if (!NO_INPUTS_ERRORS.has(problem.code)) report(messageOf(problem));
    }
    const loaded = {
      config: makeConfig(withResolverDefaults(parsed.options), posix.dirname(path)),
      references: (parsed.projectReferences ?? []).map((reference) =>
        toPosix(ts.resolveProjectReferencePath(reference)),
      ),
    };
    loadedConfigs.set(path, loaded);
    return loaded;
  };

  const configsByDirectory = new Map<string, Config[]>();

  /** The nearest config, then whatever it references. */
  const configsFor = (directory: string): Config[] => {
    const known = configsByDirectory.get(directory);
    if (known) return known;

    let configs: Config[] | undefined;
    const declared = ["tsconfig.json", "jsconfig.json"]
      .map((name) => (directory === "." ? `${root}/${name}` : `${root}/${directory}/${name}`))
      .find(isFile);
    if (declared) {
      const loaded = loadConfig(declared);
      if (loaded) {
        // A solution-style tsconfig has its aliases in the configs it references.
        const referenced = loaded.references.flatMap((path) => {
          const config = isFile(path) ? loadConfig(path) : null;
          return config ? [config.config] : [];
        });
        configs = [loaded.config, ...referenced];
      }
    }
    configs ??= directory === "." ? [defaultConfig] : configsFor(posix.dirname(directory));
    configsByDirectory.set(directory, configs);
    return configs;
  };

  // ---- classification ------------------------------------------------------

  /** Expansions of an alias under `paths`; undefined if no pattern matches it. */
  const expandAlias = (specifier: string, options: ts.CompilerOptions): string[] | undefined => {
    const base = options.pathsBasePath ?? options.baseUrl;
    if (!options.paths || typeof base !== "string") return undefined;
    for (const [pattern, targets] of Object.entries(options.paths)) {
      const [prefix, suffix] = pattern.split("*");
      const matches =
        suffix === undefined
          ? specifier === pattern
          : specifier.startsWith(prefix) &&
            specifier.endsWith(suffix) &&
            specifier.length >= prefix.length + suffix.length;
      if (matches) {
        const star =
          suffix === undefined ? "" : specifier.slice(prefix.length, specifier.length - suffix.length);
        return targets.map((target) => toPosix(resolvePath(base, target.replace("*", star))));
      }
    }
    return undefined;
  };

  /** Classifies a file that exists on disk. */
  const classify = (absolute: string): Resolution => {
    const path = relativeToRoot(absolute);
    if (path === undefined || path.split("/").includes("node_modules")) {
      return { status: "external" };
    }
    if (nodes.has(path)) return { status: "resolved", to: path };

    const skippedFile = skippedByPath.get(path);
    if (skippedFile) {
      return {
        status: "excluded",
        reason: skippedFile.reason === "not-source" ? "non-source-target" : "skipped-target",
      };
    }
    const actual = knownByLowerCase.get(path.toLowerCase());
    if (actual) {
      return {
        status: "unresolved",
        reason: "case-mismatch",
        detail: `the file on disk is ${actual}, which only matches on a case-insensitive filesystem`,
      };
    }
    if (isInExcludedDirectory(path)) {
      return { status: "excluded", reason: "excluded-directory-target" };
    }
    return {
      status: "unresolved",
      reason: "file-not-found",
      detail: `resolved to ${path}, which the walk did not find`,
    };
  };

  const isPackageDeclared = (name: string, fromDirectory: string): boolean => {
    const typesName = typesPackageFor(name);
    for (let directory = fromDirectory; ; directory = posix.dirname(directory)) {
      const dependencies = packages.get(directory)?.dependencies;
      if (dependencies?.has(name) || dependencies?.has(typesName)) return true;
      if (directory === ".") return false;
    }
  };

  const unresolvedBare = (specifier: string, fromDirectory: string, configs: Config[]): Resolution => {
    const name = packageNameOf(specifier);
    if (name && workspaces.has(name) && isInWorkspace(fromDirectory)) {
      return {
        status: "unresolved",
        reason: "workspace-entry-not-found",
        detail: `${name} is a workspace package in this repository, but its package.json entry for this import points at nothing on disk, usually build output`,
      };
    }
    if (name && (BUILTINS.has(specifier) || BUILTINS.has(name))) return { status: "external" };
    if (name && isPackageDeclared(name, fromDirectory)) return { status: "external" };

    if (!name) {
      const hasPaths = configs.some((config) => config.options.paths !== undefined);
      return {
        status: "unresolved",
        reason: "unknown-alias",
        detail: hasPaths
          ? "not a package name, and no tsconfig paths entry matches it"
          : "not a package name, and no tsconfig defines paths here",
      };
    }
    return {
      status: "unresolved",
      reason: "undeclared-package",
      detail: `no package.json from here to the repository root declares ${name}, and no tsconfig paths entry matches it`,
    };
  };

  const resolve = (specifier: string, fromPath: string): Resolution => {
    const absoluteFrom = `${root}/${fromPath}`;
    const fromDirectory = posix.dirname(fromPath);
    const configs = configsFor(fromDirectory);

    for (const { options, cache } of configs) {
      const { resolvedModule } = ts.resolveModuleName(specifier, absoluteFrom, options, plainHost, cache);
      if (resolvedModule) return classify(toPosix(resolvedModule.resolvedFileName));
    }
    const name = packageNameOf(specifier);
    if (name && workspaces.has(name) && isInWorkspace(fromDirectory)) {
      for (const { options, workspaceCache } of configs) {
        const { resolvedModule } = ts.resolveModuleName(specifier, absoluteFrom, options, workspaceHost, workspaceCache);
        if (resolvedModule) return classify(toPosix(resolvedModule.resolvedFileName));
      }
    }

    // Bundler suffixes such as "./icon.svg?url" name a file plus an instruction.
    const query = specifier.search(/[?#]/);
    if (query > 0) return resolve(specifier.slice(0, query), fromPath);

    const isRelative = /^\.\.?(\/|$)/.test(specifier);
    const aliasExpansions = configs.map(({ options }) => expandAlias(specifier, options));

    // TypeScript won't resolve "./x.css". That file is still real, and needs
    // reporting as excluded rather than failed.
    const literalPaths = isRelative
      ? [toPosix(resolvePath(posix.dirname(absoluteFrom), specifier))]
      : [
          ...aliasExpansions.flatMap((paths) => paths ?? []),
          ...configs.flatMap(({ options }) =>
            typeof options.baseUrl === "string" ? [toPosix(resolvePath(options.baseUrl, specifier))] : [],
          ),
        ];
    const literal = literalPaths.find(isFile);
    if (literal) return classify(literal);

    if (SCHEME.test(specifier)) return { status: "external" };
    if (isRelative || specifier.startsWith("/")) {
      return {
        status: "unresolved",
        reason: "file-not-found",
        detail: isRelative
          ? `no file at ${relativeToRoot(literalPaths[0]) ?? literalPaths[0]}, with any source extension or as a directory index`
          : "an absolute path, and no file exists there",
      };
    }
    const tried = aliasExpansions.find((paths) => paths !== undefined);
    if (tried) {
      return {
        status: "unresolved",
        reason: "alias-target-not-found",
        detail: `tsconfig paths maps it to ${tried.map((path) => relativeToRoot(path) ?? path).join(", ")}, and nothing is there`,
      };
    }
    return unresolvedBare(specifier, fromDirectory, configs);
  };

  return { resolve, problems };
}
