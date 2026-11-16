// The one place the AI client is constructed. Anything that calls a model goes through
// `complete`, and anything that might call one runs inside `traced`, so every call is
// recorded and nothing can reach the model around the tracing.
//
// Imports nothing from Next, so the pipeline can label files from a plain script.

import OpenAI from "openai";
import { Client, RunTree } from "langsmith";
import { getCurrentRunTree, withRunTree } from "langsmith/traceable";
import { wrapOpenAI } from "langsmith/wrappers/openai";
import { env } from "../lib/env.ts";

/**
 * Exact versions, never a moving alias. Each is part of its own cache key, so
 * re-pinning one invalidates only what that one produced.
 */
export const MODELS = {
  explain: "claude-haiku-5-5",
  label: "claude-haiku-5-5",
} as const;

/**
 * False means calls still succeed and nothing is recorded. The interface shows this,
 * because an absent key otherwise looks exactly like a working setup with no traffic.
 */
export const tracingConfigured =
  process.env.LANGSMITH_TRACING?.trim() === "true" && Boolean(process.env.LANGSMITH_API_KEY?.trim());

if (!tracingConfigured) {
  console.warn("LangSmith tracing is off: set LANGSMITH_TRACING=true and LANGSMITH_API_KEY in .env.local.");
}

// Handed to every run explicitly, so the same client that records a run is the one
// flushed afterwards. A server action can return before a background batch is sent.
const langsmith = tracingConfigured ? new Client() : undefined;

/**
 * For the evals, which can't run untraced: their datasets and experiments live in
 * LangSmith. The same client, so an experiment's model calls land in its own runs.
 */
export function requireTracing(): Client {
  if (!langsmith) throw new Error("The evals need LangSmith: set LANGSMITH_TRACING=true and LANGSMITH_API_KEY in .env.local.");
  return langsmith;
}

// The stack is the OpenAI SDK; the model behind it is Claude, through Anthropic's
// OpenAI-compatible endpoint. Usage comes back in OpenAI's shape, which is what the
// wrapper records as tokens.
const openai = wrapOpenAI(
  new OpenAI({ apiKey: env.anthropicApiKey, baseURL: "https://api.anthropic.com/v1/" }),
  { client: langsmith, tracingEnabled: tracingConfigured },
);

/**
 * Runs `work` as one recorded run. Whatever cache the work reads has to be read inside
 * it: a hit then appears as a run containing no model call, which is the only way to
 * tell a working cache from a broken one. Input must be plain data, since it's recorded.
 */
export function traced<Input extends object, Output>(
  name: string,
  work: (input: Input) => Promise<Output>,
): (input: Input) => Promise<Output> {
  return async (input) => {
    if (!langsmith) return work(input);

    // Built by hand rather than with traceable(), whose types can't be resolved over a
    // generic function. withRunTree is what makes the model call a child of this run.
    const run = new RunTree({ name, run_type: "chain", inputs: { question: input }, client: langsmith, tracingEnabled: true });
    await run.postRun();
    try {
      const output = await withRunTree(run, () => work(input));
      await run.end({ answer: output });
      return output;
    } catch (error) {
      await run.end(undefined, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      await run.patchRun();
      await langsmith.awaitPendingTraceBatches();
    }
  };
}

/**
 * Scores the run currently in progress, so a live evaluator's result sits on the very
 * trace it judged. Only call it inside `traced`. Nothing to score when tracing is off.
 */
export async function recordFeedback(key: string, { score, comment }: { score: number; comment: string }): Promise<void> {
  if (!langsmith) return;
  const run = getCurrentRunTree(true);
  if (!run) throw new Error(`Feedback "${key}" was recorded outside a traced run.`);
  await langsmith.createFeedback(run.id, key, { score, comment });
}

type Messages = OpenAI.ChatCompletionMessageParam[];
type ResponseFormat = OpenAI.ChatCompletionCreateParamsNonStreaming["response_format"];

/** One model call. Throws rather than return a partial or empty answer. */
export async function complete(
  name: string,
  { model, messages, responseFormat }: { model: string; messages: Messages; responseFormat?: ResponseFormat },
): Promise<string> {
  const response = await openai.chat.completions.create(
    // Thinking is on by default on this model and spends from the same budget, so
    // the ceiling is generous. No temperature: the model rejects anything but default.
    { model, messages, max_completion_tokens: 16000, response_format: responseFormat },
    { langsmithExtra: { name } },
  );
  const choice = response.choices[0];
  if (!choice) throw new Error(`${model} returned no answer.`);
  if (choice.finish_reason !== "stop") throw new Error(`${model} stopped early (${choice.finish_reason}).`);
  const text = choice.message.content?.trim();
  if (!text) throw new Error(`${model} returned an empty answer.`);
  return text;
}
