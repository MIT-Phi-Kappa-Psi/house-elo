"use client";

import { useActionState, useState } from "react";
import { createGameAction, type ActionState } from "@/app/actions";

const PRESETS = [
  { label: "1v1", min: 1, max: 1, minTeams: 2, maxTeams: 2 },
  { label: "2v2", min: 2, max: 2, minTeams: 2, maxTeams: 2 },
  { label: "3v3", min: 3, max: 3, minTeams: 2, maxTeams: 2 },
  { label: "5v5", min: 5, max: 5, minTeams: 2, maxTeams: 2 },
  { label: "Free-for-all", min: 1, max: 1, minTeams: 2, maxTeams: 8 },
];

export default function NewGamePage() {
  // Controlled, so presets are plain state changes and a rejected submission
  // does not wipe what was typed.
  const [name, setName] = useState("");
  const [minTeamSize, setMinTeamSize] = useState("1");
  const [maxTeamSize, setMaxTeamSize] = useState("1");
  const [minTeamsPerMatch, setMinTeamsPerMatch] = useState("2");
  const [maxTeamsPerMatch, setMaxTeamsPerMatch] = useState("2");
  const [allowsDraws, setAllowsDraws] = useState(false);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    createGameAction,
    null,
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add a game</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Team size belongs to the game, not the app — set it once here.
        </p>
      </div>

      <form action={action} className="panel space-y-5 px-5 py-5">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="field"
            placeholder="Pool"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Format</legend>
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setMinTeamSize(String(preset.min));
                  setMaxTeamSize(String(preset.max));
                  setMinTeamsPerMatch(String(preset.minTeams));
                  setMaxTeamsPerMatch(String(preset.maxTeams));
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs text-[var(--color-muted)]">
              Min per team
              <input
                name="minTeamSize"
                type="number"
                min={1}
                className="field mt-1"
                value={minTeamSize}
                onChange={(e) => setMinTeamSize(e.target.value)}
              />
            </label>
            <label className="text-xs text-[var(--color-muted)]">
              Max per team
              <input
                name="maxTeamSize"
                type="number"
                min={1}
                className="field mt-1"
                value={maxTeamSize}
                onChange={(e) => setMaxTeamSize(e.target.value)}
              />
            </label>
            <label className="text-xs text-[var(--color-muted)]">
              Min teams
              <input
                name="minTeamsPerMatch"
                type="number"
                min={2}
                className="field mt-1"
                value={minTeamsPerMatch}
                onChange={(e) => setMinTeamsPerMatch(e.target.value)}
              />
            </label>
            <label className="text-xs text-[var(--color-muted)]">
              Max teams
              <input
                name="maxTeamsPerMatch"
                type="number"
                min={2}
                className="field mt-1"
                value={maxTeamsPerMatch}
                onChange={(e) => setMaxTeamsPerMatch(e.target.value)}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Each is a range, so you can still record a 3v2 when someone drops out,
            or a three-way match in a game that is usually head-to-head. Set min and
            max equal to pin the format exactly.
          </p>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            name="allowsDraws"
            type="checkbox"
            className="size-4"
            checked={allowsDraws}
            onChange={(e) => setAllowsDraws(e.target.checked)}
          />
          Draws are possible
        </label>

        {state?.error && (
          <p className="text-sm text-[var(--color-warn)]">{state.error}</p>
        )}

        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create game"}
        </button>
      </form>
    </div>
  );
}
