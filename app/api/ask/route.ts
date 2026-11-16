import { auth } from "@clerk/nextjs/server";
import { AgentUnavailable, openThread, runAgent } from "@/lib/agent/agent-server";
import type { AskEvent, AskRequest } from "@/lib/agent/ask-events";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Long enough for a real question, short enough that a pasted file isn't one. */
const QUESTION_LIMIT = 2_000;

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}

function isAskRequest(value: unknown): value is AskRequest {
  const [analysisId, threadId, question, selected] = ["analysisId", "threadId", "question", "selected"].map((key) =>
    field(value, key),
  );
  return (
    typeof analysisId === "string" &&
    UUID.test(analysisId) &&
    (threadId === null || typeof threadId === "string") &&
    typeof question === "string" &&
    question.trim().length > 0 &&
    question.length <= QUESTION_LIMIT &&
    (selected === null || typeof selected === "string")
  );
}

function line(event: AskEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

// The only way into the agent. It proves the asker can see the analysis by minting
// the credential under their own session, so the members policy decides; then it
// opens or continues a conversation and relays the answer as it's written.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Sign in to ask.", { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!isAskRequest(body)) return new Response("That isn't a question this can send.", { status: 400 });

  const client = createServerSupabaseClient();
  const minted = await client.rpc("mint_agent_credential", { analysis: body.analysisId });
  if (minted.error) {
    // P0002 is the function's own "not visible to this session".
    if (minted.error.code === "P0002") return new Response("No such analysis.", { status: 404 });
    throw new Error(`Could not mint the agent credential: ${minted.error.message}`);
  }
  const credential = minted.data;

  // What's selected is a hint about what "this" means, not a permission: the
  // credential alone decides what the lookups can read.
  const question = body.selected
    ? `[Selected on the map: \`${body.selected}\`]\n\n${body.question.trim()}`
    : body.question.trim();

  let threadId: string;
  try {
    threadId = await openThread(body.analysisId, body.threadId);
  } catch (error) {
    if (error instanceof AgentUnavailable) return new Response(error.message, { status: 503 });
    throw error;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line({ type: "thread", id: threadId }));
      try {
        for await (const event of runAgent(threadId, question, credential, request.signal)) {
          controller.enqueue(line(event));
        }
        controller.enqueue(line({ type: "done" }));
      } catch (error) {
        if (!request.signal.aborted) {
          const message = error instanceof AgentUnavailable ? error.message : "The answer stopped partway.";
          if (!(error instanceof AgentUnavailable)) console.error("Agent stream failed:", error);
          controller.enqueue(line({ type: "error", message }));
        }
      }
      // Already closed if the browser went away, which is fine.
      if (!request.signal.aborted) controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
