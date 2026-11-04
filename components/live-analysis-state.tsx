"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isFinished } from "@/pipeline/stages";
import { StateIcon, stateColour } from "./analysis-state";
import { useAnalysisProgress } from "./use-analysis-progress";

/** One dashboard row's state, live while the run is under way. */
export function LiveAnalysisState({
  analysisId,
  status,
  message,
  abandoned,
}: {
  analysisId: string;
  status: string;
  message: string | null;
  abandoned: boolean;
}) {
  // An abandoned row stays subscribed: it's the one someone may re-run from another tab.
  const { update, disconnected } = useAnalysisProgress(analysisId, !isFinished(status));

  // The rest of the row (commit, completed time) comes from the server, so re-read
  // once when the run ends. One read per run, not a poll.
  const router = useRouter();
  const ended = update !== null && isFinished(update.stage);
  useEffect(() => {
    if (ended) router.refresh();
  }, [ended, router]);

  const shownStatus = update?.stage ?? status;
  const shownMessage = update ? update.message : message;
  // Any update at all means the run is alive, whatever its age said at page load.
  const stale = abandoned && !update;

  return (
    <>
      <div className={`flex items-center gap-1.5 ${stale ? "text-muted" : stateColour(shownStatus)}`}>
        <StateIcon status={stale ? "stale" : shownStatus} />
        <span className="capitalize">{shownStatus}</span>
        {stale && <span>(stale)</span>}
      </div>
      {stale ? (
        <p className="mt-0.5 max-w-[60ch] text-muted">No update in over 10 minutes. This run has probably stopped.</p>
      ) : (
        shownMessage && <p className="mt-0.5 max-w-[60ch] text-muted">{shownMessage}</p>
      )}
      {disconnected && <p className="mt-0.5 text-muted">Live updates are off. Reload to see the current state.</p>}
    </>
  );
}
