"use client";

import { useActionState, useRef } from "react";
import { createTicketAction, type ActionState } from "@/app/actions";

export default function TicketForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await createTicketAction(prev, formData);
      // Clear only on success, so a rejected submission keeps what was typed.
      if (result?.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={action} className="panel space-y-4 px-5 py-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="text-xs text-[var(--color-muted)]">
          What's up?
          <input
            name="title"
            required
            maxLength={200}
            className="field mt-1"
            placeholder="Leaderboard shows the wrong rating after a void"
          />
        </label>
        <label className="text-xs text-[var(--color-muted)]">
          Type
          <select name="kind" className="field mt-1">
            <option value="bug">Bug</option>
            <option value="idea">Idea</option>
          </select>
        </label>
      </div>

      <label className="block text-xs text-[var(--color-muted)]">
        Details (optional — what you did, what happened, what you expected)
        <textarea name="body" rows={3} className="field mt-1" />
      </label>

      <label className="block text-xs text-[var(--color-muted)]">
        Your name (optional)
        <input name="reporter" className="field mt-1 max-w-48" />
      </label>

      {state?.error && <p className="text-sm text-[var(--color-warn)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--color-accent)]">{state.ok}</p>}

      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Filing…" : "File ticket"}
      </button>
    </form>
  );
}
