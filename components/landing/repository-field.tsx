"use client";

import { type FormEvent, useState } from "react";
import { parseRepositoryUrl } from "@/pipeline/repository-url";

// A plain GET to the analyse route, so the URL rides in the address and survives the
// detour through sign-in. The same parser the server uses checks it first, so a URL
// that would be refused is refused here, before anyone is asked to sign in for it.
export function RepositoryField() {
  const [error, setError] = useState<string | null>(null);

  function check(event: FormEvent<HTMLFormElement>) {
    const url = new FormData(event.currentTarget).get("url");
    try {
      parseRepositoryUrl(typeof url === "string" ? url : "");
      setError(null);
    } catch (refusal) {
      event.preventDefault();
      setError(refusal instanceof Error ? refusal.message : "That URL couldn't be read.");
    }
  }

  return (
    <form action="/analyse" method="get" onSubmit={check} noValidate className="w-full max-w-[46ch]">
      <div className="flex gap-2 max-sm:flex-col">
        <input
          name="url"
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/name"
          aria-label="Public GitHub repository URL"
          aria-invalid={error !== null}
          aria-describedby={error ? "repository-error" : "repository-note"}
          className="h-11 min-w-0 flex-1 rounded border border-border bg-background px-3 font-mono text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="h-11 shrink-0 cursor-pointer rounded bg-accent px-5 text-sm font-medium text-background hover:opacity-90"
        >
          Analyse
        </button>
      </div>
      {error ? (
        <p id="repository-error" role="alert" className="mt-3 text-sm text-status-failed">
          {error}
        </p>
      ) : (
        <p id="repository-note" className="mt-3 text-sm text-muted">
          Any public repository on github.com. You&apos;ll sign in first, then it starts.
        </p>
      )}
    </form>
  );
}
