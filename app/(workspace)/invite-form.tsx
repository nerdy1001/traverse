"use client";

import { useActionState } from "react";
import { inviteMember } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, null);

  return (
    <form action={action} className="flex items-center gap-1.5">
      {state && "error" in state && <span role="alert">{state.error}</span>}
      {state && "sent" in state && <span className="text-muted">Invited {state.sent}</span>}
      <input
        name="email"
        type="email"
        required
        placeholder="email to invite"
        aria-label="Email to invite"
        className="w-40 border border-border bg-background px-1.5 py-0.5 placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer border border-border px-1.5 py-0.5 disabled:text-muted"
      >
        Invite
      </button>
    </form>
  );
}
