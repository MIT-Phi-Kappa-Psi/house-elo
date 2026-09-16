"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createStrikeoutAction, type ActionState } from "@/app/actions";
import PlayerChipsInput from "@/app/components/player-chips-input";
import { DAY_STARTS_AT_HOUR } from "@/lib/house-day";

/**
 * Owns the page header so the toggle can sit top-right beside the title while
 * the form it reveals drops in below at full width.
 */
export default function StrikeoutLogger({
  knownPlayers,
}: {
  knownPlayers: string[];
}) {
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await createStrikeoutAction(prev, formData);
      // Clear the roster on success and stay open, since these usually come in
      // batches; a rejection keeps everything that was entered.
      if (result?.ok) setPlayers([]);
      return result;
    },
    null,
  );

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLInputElement>('input[placeholder="Add a player…"]')
      ?.focus();
  }, [open]);

  return (
    <div className="space-y-4">
      <div>
        {/* Title and toggle share a row so the button stays top-right; the
            description runs full width beneath rather than crowding it. */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Strikeouts</h1>
          <button
            type="button"
            className={`shrink-0 ${open ? "btn btn-ghost" : "btn btn-primary"}`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "+ Strikeout"}
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Same players as the games. A day runs {DAY_STARTS_AT_HOUR}am to{" "}
          {DAY_STARTS_AT_HOUR}am, so anything after midnight counts toward the
          night before.
        </p>
      </div>

      {open && (
        <div ref={panelRef} className="panel px-5 py-5">
          <form action={action} className="space-y-4">
            <label className="block text-xs text-[var(--color-muted)]">
              Who
              <PlayerChipsInput
                name="players"
                selected={players}
                onChange={setPlayers}
                known={knownPlayers}
                max={1}
                placeholder="Add a player…"
                fullLabel="One at a time — remove to change"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--color-muted)]">
                When (optional — defaults to now)
                <input name="occurredAt" type="datetime-local" className="field mt-1" />
              </label>
              <label className="text-xs text-[var(--color-muted)]">
                Note (optional)
                <input name="note" className="field mt-1" placeholder="Snappa night" />
              </label>
            </div>

            {state?.error && (
              <p className="text-sm text-[var(--color-accent)]">{state.error}</p>
            )}
            {state?.ok && <p className="text-sm text-[var(--color-good)]">{state.ok}</p>}

            <button
              className="btn btn-primary"
              disabled={pending || players.length !== 1}
            >
              {pending ? "Logging…" : "Log it"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
