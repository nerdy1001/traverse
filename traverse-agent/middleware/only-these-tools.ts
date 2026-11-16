import { createMiddleware } from "langchain";

// The Deep Agents harness always mounts its own tools: a filesystem, a planner and
// a sub-agent launcher. None has anything to do with the repository, and a model
// that can read files will go looking for source code it doesn't have. This is an
// allow-list rather than a list of what to remove, so a built-in added in a later
// release is hidden too instead of quietly showing up.
export function onlyTheseTools(names: readonly string[]) {
  const allowed = new Set(names);
  return createMiddleware({
    name: "OnlyTheseTools",
    wrapModelCall(request, handler) {
      return handler({ ...request, tools: request.tools.filter((t) => allowed.has(String(t.name))) });
    },
    // A call to a hidden tool can still arrive from a model that remembers one.
    wrapToolCall(request, handler) {
      if (allowed.has(request.toolCall.name)) return handler(request);
      throw new Error(`${request.toolCall.name} is not available. Use the map lookups instead.`);
    },
  });
}
