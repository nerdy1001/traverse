import { plumbingRole } from "./shared.ts";
import type { FrameworkAdapter } from "./types.ts";

/** Assumes no framework at all, so it matches everything and reads no routes. */
export const fallbackAdapter: FrameworkAdapter = {
  name: "none",
  matches: () => true,
  read: () => ({
    roleOf: ({ path }) => plumbingRole(path) ?? "generic",
    routes: [],
    omittedRoutes: [],
  }),
};
