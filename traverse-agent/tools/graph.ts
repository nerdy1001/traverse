import { tool } from "langchain";
import * as z from "zod";

import { lookup } from "./api.ts";

// Six lookups and no more. Each one asks a question the parser already answered;
// none takes two files and returns whether they're related, because that's the
// relationship being inferred rather than queried. Response shapes: ./contract.ts.

const path = z.string().min(1).describe("Repository-relative path exactly as a lookup returned it, e.g. src/lib/auth.ts.");

export const repositorySummary = tool(
  (_input, runtime) => lookup(runtime.context, "summary"),
  {
    name: "repository_summary",
    description:
      "Overview of the whole repository: framework, file and connection counts, every role present with its count, the most-imported files, files nothing imports, and how much of the code the parser could not read. Start here when you don't yet know what's in the repository.",
    schema: z.object({}),
  },
);

export const findFiles = tool(
  ({ fragment }, runtime) => lookup(runtime.context, "files", { search: fragment }),
  {
    name: "find_files",
    description:
      "Files whose path contains the given text, case-insensitive, with each file's role. This matches names only: a match says what a file is called, not what it does. The list may be cut short; `total` says how many matched.",
    schema: z.object({
      fragment: z.string().min(1).describe("Part of a path, e.g. auth, middleware, user.service."),
    }),
  },
);

export const filesByRole = tool(
  ({ role }, runtime) => lookup(runtime.context, "files", { role }),
  {
    name: "files_by_role",
    description:
      "Every file with the given role. Roles come from framework conventions, or for files no convention identified, from a model's label. repository_summary lists the roles present. The list may be cut short; `total` says how many there are.",
    schema: z.object({
      role: z.string().min(1).describe("A role as repository_summary lists it, e.g. api-endpoint, service, entry-middleware."),
    }),
  },
);

export const fileNeighbours = tool(
  ({ path }, runtime) => lookup(runtime.context, "neighbours", { path }),
  {
    name: "file_neighbours",
    description: "One file's direct connections: the files it imports (dependsOn) and the files that import it (dependents).",
    schema: z.object({ path }),
  },
);

export const walkImports = tool(
  ({ path, direction }, runtime) => lookup(runtime.context, "walk", { path, direction }),
  {
    name: "walk_imports",
    description:
      "Follow imports out from one file, several steps deep. direction=dependents finds every file that imports it directly or through others: what a change to it could reach. direction=dependencies finds everything it relies on. Each result says how many imports away it is; `maxDepth` says how far the walk went.",
    schema: z.object({
      path,
      direction: z.enum(["dependents", "dependencies"]),
    }),
  },
);

export const routeTable = tool(
  (_input, runtime) => lookup(runtime.context, "routes"),
  {
    name: "route_table",
    description:
      "Every route whose HTTP method and path the parser read exactly, with the file and line it's declared on. `omitted` counts routes that couldn't be read exactly and so aren't listed.",
    schema: z.object({}),
  },
);

export const graphTools = [repositorySummary, findFiles, filesByRole, fileNeighbours, walkImports, routeTable];
