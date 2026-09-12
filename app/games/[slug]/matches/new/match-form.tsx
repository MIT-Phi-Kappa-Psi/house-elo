"use client";

import { useActionState, useState } from "react";
import { createMatchAction, type ActionState } from "@/app/actions";
import type { Game } from "@/lib/queries";
import { parseNames } from "@/lib/format";
import PlayerNamesInput from "@/app/components/player-names-input";

type TeamDraft = { players: string; rank: string; score: string };

function blankTeam(index: number): TeamDraft {
  return { players: "", rank: String(index + 1), score: "" };
}

export default function MatchForm({
  game,
  knownPlayers,
}: {
  game: Game;
  knownPlayers: string[];
}) {
  // Controlled, so a rejected submission does not wipe what was typed.
  const [teams, setTeams] = useState<TeamDraft[]>(() =>
    Array.from({ length: game.teamsPerMatch }, (_, i) => blankTeam(i)),
  );
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createMatchAction,
    null,
  );

  const update = (index: number, patch: Partial<TeamDraft>) =>
    setTeams((current) =>
      current.map((team, i) => (i === index ? { ...team, ...patch } : team)),
    );

  const known = new Set(knownPlayers.map((n) => n.toLowerCase()));

  const sizeHint =
    game.minTeamSize === game.maxTeamSize
      ? `${game.minTeamSize} player${game.minTeamSize === 1 ? "" : "s"}`
      : `${game.minTeamSize}–${game.maxTeamSize} players`;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="gameSlug" value={game.slug} />
      <input type="hidden" name="teamCount" value={teams.length} />

      <div className="space-y-3">
        {teams.map((team, index) => (
          <div key={index} className="panel space-y-3 px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Team {index + 1}</span>
              <span className="text-xs text-[var(--color-muted)]">{sizeHint}</span>
            </div>

            <label className="block text-xs text-[var(--color-muted)]">
              Players (comma separated — new names are created automatically)
              <PlayerNamesInput
                name={`team-${index}-players`}
                placeholder="Jackson, Sam"
                known={knownPlayers}
                value={team.players}
                onChange={(players) => update(index, { players })}
              />
            </label>

            <NameChips names={parseNames(team.players)} known={known} />

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-[var(--color-muted)]">
                Placement (1 = won)
                <input
                  name={`team-${index}-rank`}
                  type="number"
                  min={1}
                  className="field mt-1"
                  value={team.rank}
                  onChange={(e) => update(index, { rank: e.target.value })}
                />
              </label>
              <label className="text-xs text-[var(--color-muted)]">
                Score (optional)
                <input
                  name={`team-${index}-score`}
                  type="number"
                  className="field mt-1"
                  placeholder="—"
                  value={team.score}
                  onChange={(e) => update(index, { score: e.target.value })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setTeams((c) => [...c, blankTeam(c.length)])}
        >
          + Add team
        </button>
        {teams.length > 2 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setTeams((c) => c.slice(0, -1))}
          >
            − Remove team
          </button>
        )}
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        {game.allowsDraws
          ? "Give two teams the same placement to record a draw."
          : "Each team needs a distinct placement."}{" "}
        Placements — not a winner flag — are what let one form cover 1v1, teams and
        free-for-alls.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--color-muted)]">
          Played at (optional — defaults to now)
          <input name="playedAt" type="datetime-local" className="field mt-1" />
        </label>
        <label className="text-xs text-[var(--color-muted)]">
          Note (optional)
          <input name="note" className="field mt-1" placeholder="Friday league" />
        </label>
      </div>

      {state?.error && <p className="text-sm text-[var(--color-warn)]">{state.error}</p>}

      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save match"}
      </button>
    </form>
  );
}

/**
 * Names are free text, so a typo would otherwise silently fork a player's
 * rating into a second identity. Flagging which names are new makes that
 * visible before the match is saved rather than after.
 */
function NameChips({ names, known }: { names: string[]; known: Set<string> }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name, i) => {
        const isNew = !known.has(name.toLowerCase());
        return (
          <span
            key={`${name}-${i}`}
            className={`rounded px-1.5 py-0.5 text-xs ${
              isNew
                ? "bg-[#3a2f0c] text-[var(--color-warn)]"
                : "bg-[#1b2128] text-[var(--color-muted)]"
            }`}
          >
            {name}
            {isNew && <span className="ml-1 opacity-70">new</span>}
          </span>
        );
      })}
    </div>
  );
}
