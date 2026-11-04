import { posix } from "node:path";
import type { Role } from "../../lib/map/taxonomy.ts";
import { directoriesDeclaring, isOutsideApplication, plumbingRole } from "./shared.ts";
import type { FrameworkAdapter, Repository } from "./types.ts";

const FOLDER_ROLES: Readonly<Record<string, Role>> = {
  route: "route",
  routes: "route",
  router: "route",
  routers: "route",
  controller: "controller",
  controllers: "controller",
  middleware: "class-middleware",
  middlewares: "class-middleware",
  validator: "validator",
  validators: "validator",
  validation: "validator",
  validations: "validator",
  service: "service",
  services: "service",
  repository: "repository",
  repositories: "repository",
  model: "model",
  models: "model",
  schema: "schema",
  schemas: "schema",
  dto: "dto",
  dtos: "dto",
  config: "config",
  configs: "config",
};

/** The folder nearest the file decides: `routes/middleware/auth.js` is middleware. */
function folderRole(path: string): Role | undefined {
  const folders = path.toLowerCase().split("/").slice(0, -1).reverse();
  const folder = folders.find((name) => Object.hasOwn(FOLDER_ROLES, name));
  return folder === undefined ? undefined : FOLDER_ROLES[folder];
}

/**
 * Whether the package a file belongs to is the one using Express. A React client with
 * its own package.json inside an Express repository has `services` folders of its own,
 * and they aren't this framework's services.
 */
function belongsToApplication(repository: Repository): (path: string) => boolean {
  const packages = new Set(repository.packages.map(({ directory }) => directory));
  const applications = new Set(directoriesDeclaring(repository, ["express"]));
  return (path) => {
    for (let directory = posix.dirname(path); ; directory = posix.dirname(directory)) {
      if (packages.has(directory)) return applications.has(directory);
      if (directory === ".") return false;
    }
  };
}

export const expressAdapter: FrameworkAdapter = {
  name: "express",
  matches: (repository) => directoriesDeclaring(repository, ["express"]).length > 0,
  read(repository) {
    const inApplication = belongsToApplication(repository);
    return {
      roleOf({ path }) {
        const plumbing = plumbingRole(path);
        if (plumbing) return plumbing;
        if (isOutsideApplication(path) || !inApplication(path)) return "generic";
        return folderRole(path) ?? "generic";
      },
      // Assembled at runtime from routers, variables and middleware chains, so a full
      // pattern can't be read from the syntax. Nothing is listed as omitted either:
      // those are the normal case here, not exceptions worth counting.
      routes: [],
      omittedRoutes: [],
    };
  },
};
