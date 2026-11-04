"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserRealtimeClient } from "@/lib/supabase/browser";

export interface StageUpdate {
  stage: string;
  message: string | null;
  failedStage: string | null;
}

function readUpdate(payload: Record<string, unknown>): StageUpdate | null {
  const { stage, message, failedStage } = payload;
  if (typeof stage !== "string") return null;
  return {
    stage,
    message: typeof message === "string" ? message : null,
    failedStage: typeof failedStage === "string" ? failedStage : null,
  };
}

/**
 * Follows one analysis's channel. `update` is null until something newer than the
 * server-rendered state arrives, and `disconnected` says the page has stopped being
 * live, so a dropped socket can't pass for a run that isn't moving.
 */
export function useAnalysisProgress(analysisId: string, enabled: boolean) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [update, setUpdate] = useState<StageUpdate | null>(null);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const client = browserRealtimeClient(getToken);
    let cleanup: (() => void) | undefined;
    let unmounted = false;

    // The token has to be on the socket before joining, or the join goes in anonymous.
    client.realtime
      .setAuth()
      .then(() => {
        if (unmounted) return;
        const channel = client
          .channel(`analysis:${analysisId}:progress`, { config: { private: true } })
          .on("broadcast", { event: "stage" }, ({ payload }) => {
            const next = readUpdate(payload);
            if (next) setUpdate(next);
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              setDisconnected(false);
              // Anything published before this moment was missed, on first join or
              // after a dropped socket, so re-read once. Not a poll: it happens per
              // join, and a run that ended in the gap would otherwise never show it.
              setUpdate(null);
              router.refresh();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setDisconnected(true);
            }
          });
        cleanup = () => void client.removeChannel(channel);
      })
      .catch(() => {
        if (!unmounted) setDisconnected(true);
      });

    return () => {
      unmounted = true;
      cleanup?.();
    };
  }, [analysisId, enabled, getToken, router]);

  return { update, disconnected };
}
