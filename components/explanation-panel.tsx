"use client";

import type { Explanation } from "@/ai/explain";
import type { Staleness } from "@/app/(workspace)/analyses/[id]/map/explain";
import { ExplanationText } from "./explanation-text";
import { RerunButton } from "./rerun-button";

export interface ExplainContext {
  analysisId: string;
  /** False means calls succeed and nothing is recorded, which has to be visible. */
  tracing: boolean;
}

export type ExplainState =
  | { status: "pending" }
  | { status: "done"; explanation: Explanation; staleness: Staleness }
  | { status: "failed"; error: string };

function short(sha: string): string {
  return sha.slice(0, 7);
}

function StaleNotice({ staleness, subject, analysisId }: { staleness: Staleness; subject: "file" | "folder"; analysisId: string }) {
  if (staleness.state === "current") return null;
  if (staleness.state === "unknown") {
    return <p className="mb-3 px-4 text-muted">Couldn&apos;t check whether this is current. {staleness.reason}</p>;
  }
  const analysed = <span className="font-mono">{short(staleness.analysedSha)}</span>;
  const current = <span className="font-mono">{short(staleness.currentSha)}</span>;
  const sentence = {
    changed: <>This file has changed since {analysed} was analysed. The repository is now at {current}, and this explanation describes the analysed version.</>,
    removed: <>This file no longer exists at {current}. This explanation describes it as it was at {analysed}.</>,
    moved: (
      <>
        The repository has moved from {analysed} to {current} since it was analysed
        {subject === "file" ? ", though this file is unchanged." : ". The map and this explanation describe the analysed commit."}
      </>
    ),
  }[staleness.state];
  return (
    <div className="mx-4 mb-3 space-y-2 rounded-sm border border-border p-2">
      <p>{sentence}</p>
      <RerunButton analysisId={analysisId} />
    </div>
  );
}

export function ExplanationPanel({
  context,
  state,
  subject,
  paths,
  onExplain,
  onPath,
}: {
  context: ExplainContext | null;
  state: ExplainState | undefined;
  subject: "file" | "folder";
  paths: readonly string[];
  onExplain(): void;
  onPath(path: string): void;
}) {
  if (!context) return <p className="px-4 text-muted">Explanations need a stored analysis.</p>;

  const tracingOff = !context.tracing && (
    <p className="mt-4 px-4 text-muted">
      Tracing is off: <span className="font-mono">LANGSMITH_TRACING</span> and{" "}
      <span className="font-mono">LANGSMITH_API_KEY</span> aren&apos;t both set, so calls aren&apos;t recorded.
    </p>
  );

  if (state?.status === "done") {
    const { explanation, staleness } = state;
    return (
      <>
        <StaleNotice staleness={staleness} subject={subject} analysisId={context.analysisId} />
        <ExplanationText body={explanation.body} paths={paths} onPath={onPath} />
        <p className="mt-4 px-4 text-muted">
          {explanation.cached ? "From the cache" : "Written just now"} by <span className="font-mono">{explanation.model}</span>
        </p>
        {tracingOff}
      </>
    );
  }

  const pending = state?.status === "pending";
  return (
    <>
      <div className="px-4">
        <button
          type="button"
          disabled={pending}
          onClick={onExplain}
          className="h-8 cursor-pointer rounded-sm border border-border px-3 hover:bg-background disabled:cursor-default disabled:text-muted"
        >
          {pending ? "Explaining…" : state?.status === "failed" ? "Try again" : "Explain"}
        </button>
      </div>
      {state?.status === "failed" && <p className="mt-3 px-4" role="alert">{state.error}</p>}
      <p className="mt-3 px-4 text-muted">
        {subject === "file"
          ? "Written by a model from this file's source and every file it imports or is imported by."
          : "Written by a model from every file in this folder and everything connected to it from outside."}
      </p>
      {tracingOff}
    </>
  );
}
