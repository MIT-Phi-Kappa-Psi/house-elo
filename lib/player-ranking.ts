/**
 * How the player directory can be ranked. Pure, so the ordering rules are
 * testable without a DOM — and so the page can re-sort in the browser rather
 * than making a round trip per tap.
 *
 * Only the type comes from the query layer, which is erased at compile time;
 * nothing here reaches the database.
 */
import type { PlayerDirectoryRow } from "./queries";

export type SortKey = "overall" | "laps" | "matches" | "games";

export type PlayerMetric = {
  key: SortKey;
  /** Label on the sort control. */
  label: string;
  /** Label on the table column, which has far less room. */
  column: string;
  /** Completes "ranked by …" above the table. */
  blurb: string;
  /**
   * The number shown beside each player. `null` means there is none to show:
   * the row sorts last and is given no position.
   */
  value: (player: PlayerDirectoryRow) => number | null;
};

export const METRICS: PlayerMetric[] = [
  {
    key: "overall",
    label: "Overall Elo",
    column: "Elo",
    blurb: "overall Elo",
    value: (p) => p.overallRating,
  },
  {
    key: "laps",
    label: "Naked laps",
    column: "Laps",
    blurb: "naked laps owed",
    value: (p) => p.nakedLaps,
  },
  {
    key: "matches",
    label: "Matches",
    column: "Matches",
    blurb: "matches played",
    value: (p) => p.matchesPlayed,
  },
  {
    key: "games",
    label: "Games",
    column: "Games",
    blurb: "different games played",
    value: (p) => p.gamesPlayed,
  },
];

export const DEFAULT_SORT: SortKey = "overall";

export function metricFor(key: SortKey): PlayerMetric {
  return METRICS.find((m) => m.key === key) ?? METRICS[0];
}

/**
 * Whether a player earns a position number on this ranking. A zero is worth
 * showing — nobody is hiding that you owe no laps — but it is not a placing,
 * and neither is having no rating yet.
 */
export function isRanked(metric: PlayerMetric, player: PlayerDirectoryRow): boolean {
  const value = metric.value(player);
  return value !== null && value > 0;
}

/**
 * Descending on the chosen metric, with players who have none of it last.
 * Matches played breaks ties ahead of the name, so whoever actually turned up
 * sits above someone tied on the strength of a single night.
 */
export function comparing(metric: PlayerMetric) {
  return (a: PlayerDirectoryRow, b: PlayerDirectoryRow): number => {
    const av = metric.value(a);
    const bv = metric.value(b);
    if (av !== bv) {
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    }
    if (a.matchesPlayed !== b.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
    return a.name.localeCompare(b.name);
  };
}

/** A new array; the caller's order is left alone. */
export function rankPlayers(
  players: PlayerDirectoryRow[],
  key: SortKey,
): PlayerDirectoryRow[] {
  return [...players].sort(comparing(metricFor(key)));
}
