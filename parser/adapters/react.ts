import type { Role } from "../../lib/map/taxonomy.ts";
import { directoriesDeclaring, interfaceRole, isOutsideApplication, isUnder, plumbingRole } from "./shared.ts";
import type { FrameworkAdapter } from "./types.ts";

function folderRole(path: string): Role | undefined {
  const folders = path.split("/").slice(0, -1);
  if (folders.some((folder) => ["pages", "views", "screens"].includes(folder))) return "page";
  if (folders.some((folder) => ["context", "contexts"].includes(folder))) return "context";
  if (folders.some((folder) => ["store", "stores"].includes(folder))) return "store";
  return undefined;
}

export const reactAdapter: FrameworkAdapter = {
  name: "react",
  matches: (repository) => directoriesDeclaring(repository, ["react"]).length > 0,
  read(repository) {
    const directories = directoriesDeclaring(repository, ["react"]);
    return {
      roleOf({ path }) {
        const plumbing = plumbingRole(path);
        if (plumbing) return plumbing;
        if (isOutsideApplication(path) || !directories.some((directory) => isUnder(directory, path))) return "generic";
        return (folderRole(path) ?? interfaceRole(path)) ?? "generic";
      },
      // Routes in plain React are assembled at runtime by whichever router is in use.
      routes: [],
      omittedRoutes: [],
    };
  },
};
