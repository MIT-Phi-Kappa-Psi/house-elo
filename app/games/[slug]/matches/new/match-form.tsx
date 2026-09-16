"use client";

import { useActionState, useState } from "react";
import { createMatchAction, type ActionState } from "@/app/actions";
import type { Game } from "@/lib/queries";
import PlayerChipsInput from "@/app/components/player-chips-input";

type TeamDraft = {
  players: string[];
  rank: string;
  score: string;
  nakedLap: boolean;
};

function blankTeam(index: number): TeamDraft {
  return { players: [], rank: String(index + 1), score: "", nakedLap: false };
}

export default function MatchForm({
  game,
  knownPlayers,
}: {
  game: Game;
  knownPlayers: string[];
}) {
  // Controlled, so a rejected submission does not wipe what was entered.
  const [teams, setTeams] = useState<TeamDraft[]>(() =>
    Array.from({ length: game.minTeamsPerMatch }, (_, i) => blankTeam(i)),
  );
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createMatchAction,
    null,
  );

  const update = (index: number, patch: Partial<TeamDraft>) =>
    setTeams((current) =>
      current.map((team, i) => (i === index ? { ...team, ...patch } : team)),
    );

  // A player already on another team must not be offered again.
  const takenElsewhere = (index: number) =>
    teams.flatMap((team, i) => (i === index ? [] : team.players));

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
              <span className="text-xs text-[var(--color-muted)]">
                {team.players.length}/{game.maxTeamSize} · {sizeHint}
              </span>
            </div>

            <label className="block text-xs text-[var(--color-muted)]">
              Players
              <PlayerChipsInput
                name={`team-${index}-players`}
                selected={team.players}
                onChange={(players) => update(index, { players })}
                known={knownPlayers.filter(
                  (p) =>
                    !takenElsewhere(index).some(
                      (taken) => taken.toLowerCase() === p.toLowerCase(),
                    ),
                )}
                max={game.maxTeamSize}
                fullLabel={`Team full (${game.maxTeamSize})`}
              />
            </label>

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

            <label className="flex items-center gap-2 text-sm">
              <input
                name={`team-${index}-nakedLap`}
                type="checkbox"
                className="size-4"
                checked={team.nakedLap}
                onChange={(e) => update(index, { nakedLap: e.target.checked })}
              />
              Naked lap
            </label>
          </div>
        ))}
      </div>

      {game.maxTeamsPerMatch > game.minTeamsPerMatch && (
        <div className="flex flex-wrap items-center gap-2">
          {teams.length < game.maxTeamsPerMatch && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setTeams((c) => [...c, blankTeam(c.length)])}
            >
              + Add team
            </button>
          )}
          {teams.length > game.minTeamsPerMatch && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setTeams((c) => c.slice(0, -1))}
            >
              − Remove team
            </button>
          )}
          <span className="text-xs text-[var(--color-muted)]">
            {teams.length} of {game.minTeamsPerMatch}–{game.maxTeamsPerMatch} teams
          </span>
        </div>
      )}

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

      {state?.error && <p className="text-sm text-[var(--color-accent)]">{state.error}</p>}

      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save match"}
      </button>
    </form>
  );
}
