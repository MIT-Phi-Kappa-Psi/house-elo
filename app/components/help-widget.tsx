"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { createTicketAction, type ActionState } from "@/app/actions";

/**
 * Floating "?" that opens the bug/request form. Filing is open to anyone who
 * can reach the site; reading the queue back is not — that lives behind the
 * admin gate on /tickets, so one person's report is not everyone's reading.
 */
export default function HelpWidget() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await createTicketAction(prev, formData);
      if (result?.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLInputElement>("input[name=title]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close feedback form" : "Report a bug or request a change"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-xl font-bold text-[var(--color-on-accent)] shadow-lg transition hover:brightness-110 sm:bottom-6 sm:right-6"
      >
        {open ? "×" : "?"}
      </button>

      {open && (
        <>
          {/* Backdrop doubles as the tap target for dismissing on a phone. */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Report a bug or request a change"
            // Full-width sheet on a phone, anchored card on a larger screen.
            className="panel fixed inset-x-3 bottom-20 z-50 max-h-[75vh] overflow-y-auto px-4 py-4 shadow-2xl sm:inset-x-auto sm:right-6 sm:w-96"
          >
            <h2 className="text-sm font-semibold">Something broken or missing?</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Send it over and it'll get triaged.
            </p>

            <form ref={formRef} action={action} className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="text-xs text-[var(--color-muted)]">
                  What's up?
                  <input
                    name="title"
                    required
                    maxLength={200}
                    className="field mt-1"
                    placeholder="Leaderboard looks wrong after a void"
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
                Details (optional)
                <textarea name="body" rows={3} className="field mt-1" />
              </label>

              <label className="block text-xs text-[var(--color-muted)]">
                Your name (optional)
                <input name="reporter" className="field mt-1" />
              </label>

              {state?.error && (
                <p className="text-sm text-[var(--color-accent)]">{state.error}</p>
              )}
              {state?.ok && (
                <p className="text-sm text-[var(--color-good)]">{state.ok}</p>
              )}

              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={pending}>
                  {pending ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
