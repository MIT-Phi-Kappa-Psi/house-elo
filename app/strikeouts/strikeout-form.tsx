"use client";

import { useActionState, useState } from "react";
import { createStrikeoutAction, type ActionState } from "@/app/actions";
import PlayerChipsInput from "@/app/components/player-chips-input";

export default function StrikeoutForm({ knownPlayers }: { knownPlayers: string[] }) {
  const [players, setPlayers] = useState<string[]>([]);
  const [amount, setAmount] = useState("1");

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await createStrikeoutAction(prev, formData);
      // Clear the roster on success so the next one starts fresh, but keep
      // everything on a rejection.
      if (result?.ok) setPlayers([]);
      return result;
    },
    null,
  );

  return (
    <form action={action} className="panel space-y-4 px-5 py-5">
      <h2 className="text-sm font-semibold">Log a strikeout</h2>

      <label className="block text-xs text-[var(--color-muted)]">
        Who
        <PlayerChipsInput
          name="players"
          selected={players}
          onChange={setPlayers}
          known={knownPlayers}
          placeholder="Add a player…"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-[var(--color-muted)]">
          How many (each)
          <input
            name="amount"
            type="number"
            min={1}
            max={100}
            className="field mt-1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--color-muted)]">
          When (optional — defaults to now)
          <input name="occurredAt" type="datetime-local" className="field mt-1" />
        </label>
        <label className="text-xs text-[var(--color-muted)]">
          Note (optional)
          <input name="note" className="field mt-1" placeholder="Snappa night" />
        </label>
      </div>

      {state?.error && <p className="text-sm text-[var(--color-accent)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--color-good)]">{state.ok}</p>}

      <button className="btn btn-primary" disabled={pending || players.length === 0}>
        {pending ? "Logging…" : "Log it"}
      </button>
    </form>
  );
}
