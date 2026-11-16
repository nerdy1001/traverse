import { createMiddleware, ToolMessage } from "langchain";

// A failed lookup is something the model has to hear about, not the end of the run.
// LangChain only hands schema errors back to the model; anything else a tool throws
// stops the answer. "No file at that path" is the model's to correct, and "the map
// couldn't be reached" is its to report, so both come back as an error result.
export const lookupErrors = createMiddleware({
  name: "LookupErrors",
  async wrapToolCall(request, handler) {
    try {
      return await handler(request);
    } catch (error) {
      return new ToolMessage({
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        tool_call_id: request.toolCall.id ?? "",
        name: request.toolCall.name,
        status: "error",
      });
    }
  },
});
