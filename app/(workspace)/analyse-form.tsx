"use client";

import { useActionState } from "react";
import { startAnalysis } from "./actions";

export function AnalyseForm() {
  const [state, action, pending] = useActionState(startAnalysis, null);

  return (
    <form action={action} className="border-b border-border px-5 py-3">
      <div className="flex items-center gap-2">
        <input
          name="url"
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/name"
          aria-label="Public GitHub repository URL"
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "analyse-error" : undefined}
          className="h-9 w-full max-w-[60ch] rounded border border-border bg-background px-3 font-mono placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 shrink-0 cursor-pointer rounded bg-accent px-4 font-medium text-background hover:opacity-90 disabled:cursor-default disabled:opacity-60"
        >
          Analyse
        </button>
      </div>
      {state?.error && (
        <p id="analyse-error" role="alert" className="mt-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
