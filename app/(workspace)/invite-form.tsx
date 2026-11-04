"use client";

import { useActionState } from "react";
import { inviteMember } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, null);

  return (
    <form action={action} className="flex items-center gap-2">
      {state && "error" in state && <span role="alert">{state.error}</span>}
      {state && "sent" in state && <span className="text-muted">Invited {state.sent}</span>}
      <input
        name="email"
        type="email"
        required
        placeholder="email to invite"
        aria-label="Email to invite"
        className="h-9 w-44 rounded border border-border bg-background px-3 placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-9 cursor-pointer rounded border border-border px-3 disabled:text-muted"
      >
        Invite
      </button>
    </form>
  );
}
