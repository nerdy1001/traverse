// Talks to the agent's own server: threads and streamed runs. The runtime provides
// both, so this only calls them and translates what comes back.

import type { AskEvent } from "./ask-events.ts";
import { streamText } from "./stream-text.ts";

/** The agent's name in traverse-agent/agent.ts, which the runtime uses as its id. */
const ASSISTANT = "traverse";

/** Reaching a local process; longer than this means it isn't running. */
const CONNECT_TIMEOUT_MS = 5_000;

export class AgentUnavailable extends Error {}

function config(): { url: string; key: string } {
  // Read on use rather than at boot: the rest of the app has to start and work
  // without the agent configured or running.
  const url = process.env.AGENT_URL?.trim();
  const key = process.env.LANGSMITH_API_KEY?.trim();
  if (!url) throw new AgentUnavailable("AGENT_URL is not set in .env.local.");
  if (!key) throw new AgentUnavailable("LANGSMITH_API_KEY is not set in .env.local.");
  return { url: url.replace(/\/+$/, ""), key };
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const { url, key } = config();
  try {
    return await fetch(`${url}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-api-key": key },
    });
  } catch (error) {
    throw new AgentUnavailable(`The agent isn't reachable at ${url}. Is it running?`, { cause: error });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every caller shares one agent key, so the server's own thread ownership can't
 * tell organizations apart. Each thread is tagged with its analysis instead, and a
 * thread is only continued for the analysis it was opened on. The caller has just
 * proved it can see that analysis.
 */
export async function openThread(analysisId: string, threadId: string | null): Promise<string> {
  if (threadId) {
    const response = await call(`/threads/${encodeURIComponent(threadId)}`, {
      method: "GET",
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });
    const thread: unknown = response.ok ? await response.json() : null;
    if (isRecord(thread) && isRecord(thread.metadata) && thread.metadata.analysis === analysisId) return threadId;
    // Gone or someone else's: start fresh rather than say which.
  }
  const response = await call("/threads", {
    method: "POST",
    body: JSON.stringify({ metadata: { analysis: analysisId } }),
    signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
  });
  if (!response.ok) throw new AgentUnavailable(`The agent refused a new conversation (${response.status}).`);
  const thread: unknown = await response.json();
  if (!isRecord(thread) || typeof thread.thread_id !== "string") throw new Error("The agent returned a thread without an id");
  return thread.thread_id;
}

// In words, because the panel shows the steps to someone reading the answer.
function describe(tool: string, args: Record<string, unknown>): { label: string; subject: string | null } {
  const text = (key: string) => (typeof args[key] === "string" ? args[key] : null);
  switch (tool) {
    case "repository_summary":
      return { label: "Read the repository summary", subject: null };
    case "find_files":
      return { label: "Searched paths for", subject: text("fragment") };
    case "files_by_role":
      return { label: "Listed files with role", subject: text("role") };
    case "file_neighbours":
      return { label: "Read the direct connections of", subject: text("path") };
    case "walk_imports":
      return {
        label: args.direction === "dependencies" ? "Walked what this imports:" : "Walked what imports this:",
        subject: text("path"),
      };
    case "route_table":
      return { label: "Read the route table", subject: null };
    default:
      return { label: `Called ${tool}`, subject: null };
  }
}

/** How much came back, so a step says more than "done". */
function noteOn(content: unknown): string {
  if (typeof content !== "string") return "done";
  let body: unknown;
  try {
    body = JSON.parse(content);
  } catch {
    return content.slice(0, 120);
  }
  if (!isRecord(body)) return "done";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (typeof body.framework === "string" && typeof body.files === "number") return `${body.framework}, ${plural(body.files, "file")}`;
  if (typeof body.total === "number") return plural(body.total, "file");
  if (Array.isArray(body.reached)) return `${plural(body.reached.length, "file")} within ${body.maxDepth} steps`;
  if (Array.isArray(body.dependsOn) && Array.isArray(body.dependents)) {
    return `imports ${body.dependsOn.length}, imported by ${body.dependents.length}`;
  }
  if (Array.isArray(body.routes)) return plural(body.routes.length, "route");
  return "done";
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => (isRecord(block) && block.type === "text" && typeof block.text === "string" ? block.text : "")).join("");
}

/** Messages a node returned, wherever in the update the runtime put them. */
function messagesIn(update: unknown): Record<string, unknown>[] {
  if (!isRecord(update)) return [];
  return Object.values(update).flatMap((node) =>
    isRecord(node) && Array.isArray(node.messages) ? node.messages.filter(isRecord) : [],
  );
}

function* translate(event: string, data: unknown): Generator<AskEvent> {
  if (event === "error") {
    const message = isRecord(data) && typeof data.message === "string" ? data.message : "The agent failed.";
    yield { type: "error", message };
    return;
  }
  // Tool calls and results come whole from updates; prose comes token by token from messages.
  if (event === "updates") {
    for (const message of messagesIn(data)) {
      if (message.type === "ai" && Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
          if (!isRecord(toolCall) || typeof toolCall.id !== "string" || typeof toolCall.name !== "string") continue;
          yield { type: "step", id: toolCall.id, ...describe(toolCall.name, isRecord(toolCall.args) ? toolCall.args : {}) };
        }
      }
      if (message.type === "tool" && typeof message.tool_call_id === "string") {
        const ok = message.status !== "error";
        const note = ok ? noteOn(message.content) : textOf(message.content).replace(/^Error:\s*/, "").slice(0, 160);
        yield { type: "result", id: message.tool_call_id, ok, note };
      }
    }
  }
  if (event === "messages" && Array.isArray(data) && isRecord(data[0])) {
    const chunk = data[0];
    if (chunk.type === "AIMessageChunk" || chunk.type === "ai") {
      const delta = textOf(chunk.content);
      if (delta) yield { type: "text", delta };
    }
  }
}

/** Server-sent events, parsed as they arrive. */
async function* serverEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: unknown }> {
  let buffer = "";
  for await (const text of streamText(body)) {
    buffer += text.replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length === 0) continue;
      try {
        yield { event, data: JSON.parse(data.join("\n")) };
      } catch {
        yield { event, data: data.join("\n") };
      }
    }
  }
}

export async function* runAgent(
  threadId: string,
  question: string,
  credential: string,
  signal: AbortSignal,
): AsyncGenerator<AskEvent> {
  const response = await call(`/threads/${encodeURIComponent(threadId)}/runs/stream`, {
    method: "POST",
    body: JSON.stringify({
      assistant_id: ASSISTANT,
      input: { messages: [{ role: "user", content: question }] },
      // Never in the messages: the model can't read it, quote it, or be talked into changing it.
      context: { credential },
      stream_mode: ["updates", "messages-tuple"],
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new AgentUnavailable(`The agent couldn't start an answer (${response.status}).`);
  }
  for await (const { event, data } of serverEvents(response.body)) yield* translate(event, data);
}
