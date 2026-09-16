"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  mergePlayersAction,
  renamePlayerAction,
  type ActionState,
} from "@/app/actions";
import type { PlayerDirectoryRow } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import {
  DEFAULT_SORT,
  METRICS,
  isRanked,
  metricFor,
  rankPlayers,
  type SortKey,
} from "@/lib/player-ranking";

/**
 * Colour for the active number. Kept here rather than in `lib/player-ranking`,
 * which owns what the ranking *means* and should not know about CSS.
 */
const TONES: Partial<Record<SortKey, (p: PlayerDirectoryRow) => string>> = {
  // A rating still settling is shown, but greyed, so it does not read as a
  // verdict — the same treatment the per-game leaderboards give it.
  overall: (p) => (p.overallProvisional ? "text-[var(--color-muted)]" : ""),
  laps: () => "text-[var(--color-warn)]",
};

export default function PlayerDirectory({
  players,
  provisionalMatches,
}: {
  players: PlayerDirectoryRow[];
  /** Passed in rather than imported: `lib/queries` cannot cross to the client. */
  provisionalMatches: number;
}) {
  const [merging, setMerging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  const active = metricFor(sort);
  // The other three stay on the table as context, so switching the sort never
  // hides a number that was on screen a moment ago.
  const secondary = METRICS.filter((m) => m.key !== sort);

  const ordered = useMemo(() => rankPlayers(players, sort), [players, sort]);

  const anyProvisional = players.some((p) => p.overallProvisional);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-muted)]">
          {players.length} {players.length === 1 ? "player" : "players"}, ranked by{" "}
          {active.blurb}
        </p>
        {players.length >= 2 && (
          <button className="btn btn-ghost" onClick={() => setMerging((m) => !m)}>
            {merging ? "Cancel merge" : "Merge duplicates"}
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label="Rank players by"
        className="flex flex-wrap gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-1"
      >
        {METRICS.map((metric) => (
          <button
            key={metric.key}
            onClick={() => setSort(metric.key)}
            aria-pressed={metric.key === sort}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              metric.key === sort
                ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-ink)]"
            }`}
          >
            {metric.label}
          </button>
        ))}
      </div>

      {merging && <MergePanel players={players} onDone={() => setMerging(false)} />}

      {players.length === 0 ? (
        <div className="panel px-5 py-10 text-center text-sm text-[var(--color-muted)]">
          No players yet. They&apos;re created automatically the first time you name
          someone in a match.
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          {/* 20rem clears a 375px phone inside the panel's padding; on a narrow
              screen only the ranked metric is on show, so nothing is crushed. */}
          <table className="w-full min-w-[20rem] text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr className="border-b border-[var(--color-line)]">
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Player</th>
                {/* The metric being sorted on never collapses on a narrow
                    screen — it is the one number the ordering is claiming. */}
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--color-text)]">
                  {active.column}
                </th>
                {secondary.map((metric) => (
                  <th
                    key={metric.key}
                    className="hidden px-4 py-3 text-right font-medium sm:table-cell"
                  >
                    {metric.column}
                  </th>
                ))}
                <th className="hidden px-4 py-3 text-right font-medium md:table-cell">
                  Last played
                </th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((player, index) => (
                <tr key={player.id} className="border-t border-[var(--color-line)]">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted)]">
                    {isRanked(active, player) ? index + 1 : "–"}
                  </td>
                  <td className="px-4 py-3">
                    {editing === player.id ? (
                      <RenameForm player={player} onDone={() => setEditing(null)} />
                    ) : (
                      <span className="font-medium">{player.name}</span>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-semibold ${
                      active.value(player) === null
                        ? "text-[var(--color-muted)]"
                        : (TONES[sort]?.(player) ?? "")
                    }`}
                  >
                    {active.value(player) ?? "—"}
                  </td>
                  {secondary.map((metric) => (
                    <td
                      key={metric.key}
                      className="hidden px-4 py-3 text-right font-mono text-xs text-[var(--color-muted)] sm:table-cell"
                    >
                      {metric.value(player) ?? "—"}
                    </td>
                  ))}
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-xs text-[var(--color-muted)] md:table-cell">
                    {player.lastPlayed ? formatDate(player.lastPlayed) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs text-[var(--color-muted)] underline hover:text-[var(--color-text)]"
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

      <div className="space-y-1 text-xs text-[var(--color-muted)]">
        <p>
          Overall Elo is one ladder across every game: every match the house has
          logged, replayed in order, so beating someone is worth what they are
          worth house-wide rather than what they are worth at that one game. A
          game&apos;s own standings and history live on{" "}
          <Link href="/" className="underline hover:text-[var(--color-text)]">
            its page
          </Link>
          .
        </p>
        {sort === "overall" && anyProvisional && (
          <p>
            Greyed ratings are still placing — under {provisionalMatches} matches
            logged in total.
          </p>
        )}
      </div>
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
        <span className="text-xs text-[var(--color-accent)]">{state.error}</span>
      )}
      {state?.ok && (
        <span className="text-xs text-[var(--color-good)]" onAnimationEnd={onDone}>
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
          <span className="font-semibold text-[var(--color-accent)]">{source.name}</span> will be
          deleted and their {source.matchesPlayed} match
          {source.matchesPlayed === 1 ? "" : "es"} moved to{" "}
          <span className="font-semibold text-[var(--color-good)]">{target.name}</span>. This
          cannot be undone.
        </p>
      )}

      {state?.error && <p className="text-sm text-[var(--color-accent)]">{state.error}</p>}
      {state?.ok && <p className="text-sm text-[var(--color-good)]">{state.ok}</p>}

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
