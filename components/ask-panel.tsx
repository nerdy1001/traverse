"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { AskEvent, AskRequest } from "@/lib/agent/ask-events";
import { streamText } from "@/lib/agent/stream-text";
import { StateIcon } from "./analysis-state";
import { ExplanationText } from "./explanation-text";

type Step = { kind: "step"; id: string; label: string; subject: string | null; result: { ok: boolean; note: string } | null };
type Item = { kind: "text"; text: string } | Step;

interface Turn {
  question: string;
  /** In the order they happened, so a lookup sits above the prose written after it. */
  items: Item[];
  status: "running" | "done" | "failed";
  error: string | null;
}

export interface Conversation {
  turns: readonly Turn[];
  running: boolean;
  ask(question: string, selected: string | null): void;
  reset(): void;
}

function applyEvent(turn: Turn, event: AskEvent): Turn {
  switch (event.type) {
    case "step":
      return { ...turn, items: [...turn.items, { kind: "step", id: event.id, label: event.label, subject: event.subject, result: null }] };
    case "result":
      return {
        ...turn,
        items: turn.items.map((item) =>
          item.kind === "step" && item.id === event.id ? { ...item, result: { ok: event.ok, note: event.note } } : item,
        ),
      };
    case "text": {
      const last = turn.items.at(-1);
      if (last?.kind === "text") return { ...turn, items: [...turn.items.slice(0, -1), { kind: "text", text: last.text + event.delta }] };
      return { ...turn, items: [...turn.items, { kind: "text", text: event.delta }] };
    }
    case "done":
      return { ...turn, status: "done" };
    case "error":
      return { ...turn, status: "failed", error: event.message };
    case "thread":
      return turn;
  }
}

function isAskEvent(value: unknown): value is AskEvent {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

/**
 * Held by the pane rather than the panel, so leaving Ask and coming back finds the
 * conversation where it was.
 */
export function useConversation(analysisId: string | null): Conversation {
  const [turns, setTurns] = useState<Turn[]>([]);
  const thread = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const running = turns.at(-1)?.status === "running";

  function updateLast(change: (turn: Turn) => Turn) {
    setTurns((previous) => (previous.length === 0 ? previous : [...previous.slice(0, -1), change(previous[previous.length - 1])]));
  }

  async function send(question: string, selected: string | null, controller: AbortController) {
    if (!analysisId) return;
    const request: AskRequest = { analysisId, threadId: thread.current, question, selected };
    let finished = false;
    const fail = (message: string) => updateLast((turn) => ({ ...turn, status: "failed", error: message }));
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        fail((await response.text()) || `The request failed (${response.status}).`);
        return;
      }
      let buffer = "";
      for await (const text of streamText(response.body)) {
        buffer += text;
        let end: number;
        while ((end = buffer.indexOf("\n")) !== -1) {
          const parsed: unknown = JSON.parse(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
          if (!isAskEvent(parsed)) continue;
          if (parsed.type === "thread") thread.current = parsed.id;
          if (parsed.type === "done" || parsed.type === "error") finished = true;
          updateLast((turn) => applyEvent(turn, parsed));
        }
      }
      if (!finished) fail("The answer stopped partway.");
    } catch {
      if (!controller.signal.aborted) fail("Couldn't reach the server.");
    }
  }

  return {
    turns,
    running,
    ask(question, selected) {
      if (running || !analysisId) return;
      const controller = new AbortController();
      inFlight.current = controller;
      setTurns((previous) => [...previous, { question, items: [], status: "running", error: null }]);
      void send(question, selected, controller);
    },
    reset() {
      inFlight.current?.abort();
      thread.current = null;
      setTurns([]);
    },
  };
}

function StepRow({ step }: { step: Step }) {
  const state = step.result === null ? "running" : step.result.ok ? "complete" : "failed";
  const colour = { running: "text-status-running", complete: "text-status-complete", failed: "text-status-failed" }[state];
  return (
    <li className="flex items-start gap-1.5 px-4 py-0.5">
      {/* StateIcon draws any pipeline stage as in progress; "fetching" is one. */}
      <span className={`mt-0.5 shrink-0 ${colour}`}>
        <StateIcon status={state === "running" ? "fetching" : state} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-muted">{step.label}</span>
        {step.subject && <span className="ml-1 font-mono break-all">{step.subject}</span>}
        {step.result && (
          <span className={`ml-1.5 ${step.result.ok ? "text-muted" : "text-status-failed"}`}>· {step.result.note}</span>
        )}
      </span>
    </li>
  );
}

function TurnView({ turn, paths, onPath }: { turn: Turn; paths: readonly string[]; onPath(path: string): void }) {
  const looked = turn.items.some((item) => item.kind === "step");
  return (
    <section className="border-b border-border py-3">
      <p className="mb-2 px-4 font-medium whitespace-pre-wrap">{turn.question}</p>
      <div className="space-y-2">
        {turn.items.map((item, index) =>
          item.kind === "step" ? (
            // Consecutive steps read as one list.
            <ul key={item.id}>
              <StepRow step={item} />
            </ul>
          ) : (
            <ExplanationText key={index} body={item.text} paths={paths} onPath={onPath} />
          ),
        )}
      </div>
      {turn.status === "running" && turn.items.length === 0 && <p className="px-4 text-muted">Starting…</p>}
      {/* The one failure this product exists to prevent, so it's said rather than hidden. */}
      {turn.status === "done" && !looked && (
        <p className="mt-2 px-4 text-status-failed">No lookups were made for this answer, so none of it comes from the map.</p>
      )}
      {turn.status === "failed" && <p className="mt-2 px-4 text-status-failed">{turn.error}</p>}
    </section>
  );
}

export function AskPanel({
  conversation,
  available,
  selected,
  paths,
  onPath,
}: {
  conversation: Conversation;
  /** False where there's no stored analysis for the agent to read. */
  available: boolean;
  selected: string | null;
  paths: readonly string[];
  onPath(path: string): void;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const { turns, running } = conversation;

  // Only when a question is asked, never as the answer grows: nothing moves on its own.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns.length]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const question = draft.trim();
    if (!question || running) return;
    conversation.ask(question, selected);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) submit(event);
  }

  if (!available) {
    return <p className="px-4 py-4 text-muted">Asking needs a stored analysis to look things up in.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {turns.length === 0 ? (
          <p className="px-4 py-4 leading-relaxed text-muted">
            Ask about this repository: where something lives, what imports what, what a change could reach. Every
            lookup behind the answer is listed as it runs.
          </p>
        ) : (
          turns.map((turn, index) => <TurnView key={index} turn={turn} paths={paths} onPath={onPath} />)
        )}
      </div>
      <form onSubmit={submit} className="shrink-0 border-t border-border p-3">
        {selected && (
          <p className="mb-1.5 flex min-w-0 gap-1 text-muted">
            <span className="shrink-0">Selected:</span>
            <span className="truncate font-mono" title={selected}>
              {selected}
            </span>
          </p>
        )}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          maxLength={2000}
          placeholder="Where is authentication handled?"
          aria-label="Question"
          className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 placeholder:text-muted"
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={conversation.reset}
            disabled={turns.length === 0}
            className="cursor-pointer text-muted hover:text-foreground disabled:invisible"
          >
            New conversation
          </button>
          <button
            type="submit"
            disabled={running || draft.trim().length === 0}
            className="h-7 cursor-pointer rounded bg-accent px-3 font-medium text-background hover:opacity-90 disabled:cursor-default disabled:opacity-60"
          >
            {running ? "Answering…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}
