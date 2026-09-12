"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  mergePlayersAction,
  renamePlayerAction,
  type ActionState,
} from "@/app/actions";
import type { PlayerDirectoryRow } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export default function PlayerDirectory({
  players,
}: {
  players: PlayerDirectoryRow[];
}) {
  const [merging, setMerging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-muted)]">
          {players.length} {players.length === 1 ? "player" : "players"}
        </p>
        {players.length >= 2 && (
          <button className="btn btn-ghost" onClick={() => setMerging((m) => !m)}>
            {merging ? "Cancel merge" : "Merge duplicates"}
          </button>
        )}
      </div>

      {merging && <MergePanel players={players} onDone={() => setMerging(false)} />}

      {players.length === 0 ? (
        <div className="panel px-5 py-10 text-center text-sm text-[var(--color-muted)]">
          No players yet. They're created automatically the first time you name
          someone in a match.
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr className="border-b border-[var(--color-line)]">
                <th className="px-4 py-3 text-left font-medium">Player</th>
                <th className="px-4 py-3 text-right font-medium">Matches</th>
                <th className="px-4 py-3 text-right font-medium">Games</th>
                <th className="px-4 py-3 text-right font-medium">Last played</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-3">
                    {editing === player.id ? (
                      <RenameForm player={player} onDone={() => setEditing(null)} />
                    ) : (
                      <span className="font-medium">{player.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-[var(--color-muted)]">
                    {player.matchesPlayed}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-[var(--color-muted)]">
                    {player.gamesPlayed}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--color-muted)]">
                    {player.lastPlayed ? formatDate(player.lastPlayed) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs text-[var(--color-muted)] underline hover:text-white"
                      onClick={() =>
                        setEditing((e) => (e === player.id ? null : player.id))
                      }
                    >
                      {editing === player.id ? "cancel" : "rename"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--color-muted)]">
        Ratings live per game — open a game from{" "}
        <Link href="/" className="underline hover:text-white">
          Games
        </Link>{" "}
        to see a player's standing and history there.
      </p>
    </div>
  );
}

function RenameForm({
  player,
  onDone,
}: {
  player: PlayerDirectoryRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    renamePlayerAction,
    null,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="playerId" value={player.id} />
      <input
        name="name"
        defaultValue={player.name}
        className="field max-w-48"
        autoFocus
      />
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "…" : "Save"}
      </button>
      {state?.error && (
        <span className="text-xs text-[var(--color-warn)]">{state.error}</span>
      )}
      {state?.ok && (
        <span className="text-xs text-[var(--color-accent)]" onAnimationEnd={onDone}>
          {state.ok}
        </span>
      )}
    </form>
  );
}

/**
 * Merging is destructive and irreversible, so the panel states the direction in
 * plain words and names which record survives before anything is submitted.
 */
function MergePanel({
  players,
  onDone,
}: {
  players: PlayerDirectoryRow[];
  onDone: () => void;
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    mergePlayersAction,
    null,
  );

  const source = players.find((p) => p.id === sourceId);
  const target = players.find((p) => p.id === targetId);

  return (
    <form action={action} className="panel space-y-4 px-5 py-5">
      <div>
        <h2 className="text-sm font-semibold">Merge duplicates</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Every match played under the first name is reassigned to the second,
          and affected ratings are recomputed from the match log.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--color-muted)]">
          Duplicate to remove
          <select
            name="sourceId"
            className="field mt-1"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">Select a player…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.matchesPlayed})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--color-muted)]">
          Player to keep
          <select
            name="targetId"
            className="field mt-1"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">Select a player…</option>
            {players
              .filter((p) => p.id !== sourceId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.matchesPlayed})
                </option>
              ))}
          </select>
        </label>
      </div>

      {source && target && (
        <p className="text-sm">
          <span className="text-[var(--color-warn)]">{source.name}</span> will be
          deleted and their {source.matchesPlayed} match
          {source.matchesPlayed === 1 ? "" : "es"} moved to{" "}
          <span className="text-[var(--color-accent)]">{target.name}</span>. This
          cannot be undone.
        </p>
      )}

      {state?.error && <p className="text-sm text-[var(--color-warn)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--color-accent)]">{state.ok}</p>}

      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={pending || !source || !target}
        >
          {pending ? "Merging…" : "Merge"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Done
        </button>
      </div>
    </form>
  );
}
