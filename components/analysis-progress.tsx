"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isFinished, isStage, STAGE_LABELS, STAGES, type Stage } from "@/pipeline/stages";
import { StateIcon } from "./analysis-state";
import { RerunButton } from "./rerun-button";
import { useAnalysisProgress } from "./use-analysis-progress";

type StepState = "done" | "current" | "failed" | "pending";

function stepState(step: Stage, status: string, failedStage: string | null): StepState {
  if (status === "complete") return "done";
  const reached = status === "failed" ? failedStage : status;
  const at = STAGES.findIndex((stage) => stage === reached);
  const index = STAGES.indexOf(step);
  if (at === -1 || index > at) return "pending";
  if (index < at) return "done";
  return status === "failed" ? "failed" : "current";
}

const STEP_ICON: Record<StepState, string> = {
  done: "complete",
  current: "fetching",
  failed: "failed",
  pending: "queued",
};

const STEP_COLOUR: Record<StepState, string> = {
  done: "text-status-complete",
  current: "text-status-running",
  failed: "text-status-failed",
  pending: "text-muted",
};

export function AnalysisProgress({
  analysisId,
  status,
  message,
  failedStage,
  abandoned,
}: {
  analysisId: string;
  status: string;
  message: string | null;
  failedStage: string | null;
  abandoned: boolean;
}) {
  // Subscribed in every state, because a re-run can start here from any of them.
  const { update, disconnected } = useAnalysisProgress(analysisId, true);
  const router = useRouter();

  const shownStatus = update?.stage ?? status;

  // Replace, so Back doesn't return to a finished progress page. A run that finished
  // before this page subscribed is covered by the server redirect on re-read.
  const finishedLive = update?.stage === "complete";
  useEffect(() => {
    if (finishedLive) router.replace(`/analyses/${analysisId}/map`);
  }, [finishedLive, analysisId, router]);

  const shownMessage = update ? update.message : message;
  const shownFailedStage = update ? update.failedStage : failedStage;
  const stale = abandoned && !update;

  return (
    <div className="max-w-[80ch] px-5 py-3">
      <ol>
        {STAGES.map((step) => {
          const state = stepState(step, shownStatus, shownFailedStage);
          return (
            <li key={step}>
              <div className={`flex items-center gap-1.5 py-0.5 ${stale && state === "current" ? "text-muted" : STEP_COLOUR[state]}`}>
                <StateIcon status={STEP_ICON[state]} />
                <span className={state === "current" ? "font-medium" : undefined}>{STAGE_LABELS[step]}</span>
              </div>
              {(state === "current" || state === "failed") && shownMessage && (
                <p className={`pb-0.5 pl-4.5 ${state === "failed" ? "text-foreground" : "text-muted"}`}>{shownMessage}</p>
              )}
            </li>
          );
        })}
      </ol>

      {shownStatus === "queued" && !stale && <p className="mt-1.5 text-muted">Waiting to start.</p>}
      {shownStatus === "complete" && shownMessage && <p className="mt-1.5">{shownMessage}</p>}
      {stale && (
        <p className="mt-1.5">
          {isStage(shownStatus) ? `Stopped at ${shownStatus}?` : "Never started?"} No update in over 10 minutes, so this run
          has probably stopped.
        </p>
      )}
      {disconnected && <p className="mt-1.5 text-muted">Live updates are off. Reload to see the current state.</p>}

      {(isFinished(shownStatus) || stale) && (
        <div className="mt-2">
          <RerunButton analysisId={analysisId} />
        </div>
      )}
    </div>
  );
}
