import { defineDeepAgent } from "managed-deepagents";

import { lookupErrors } from "./middleware/lookup-errors.ts";
import { onlyTheseTools } from "./middleware/only-these-tools.ts";
import { contextSchema } from "./tools/api.ts";
import { graphTools } from "./tools/graph.ts";

// The system prompt is instructions.md beside this file; the runtime inserts it.
export const agent = defineDeepAgent({
  name: "traverse",
  // The cheapest model, by choice. If the evaluation shows it answering without
  // looking, this is the first thing to revisit.
  model: "anthropic:claude-haiku-5-5",
  tools: graphTools,
  contextSchema,
  // First is outermost, so a refused hidden tool also comes back as an error result.
  middleware: [lookupErrors, onlyTheseTools(graphTools.map((t) => t.name))],
});
