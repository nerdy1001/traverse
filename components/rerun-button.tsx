"use client";

import { useActionState } from "react";
import { rerunAnalysis } from "@/app/(workspace)/actions";

export function RerunButton({ analysisId }: { analysisId: string }) {
  const [state, action, pending] = useActionState(rerunAnalysis, null);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="analysisId" value={analysisId} />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer h-8 rounded border border-border px-3 whitespace-nowrap disabled:text-muted"
      >
        Re-run analysis
      </button>
      {state?.error && <span role="alert">{state.error}</span>}
    </form>
  );
}
