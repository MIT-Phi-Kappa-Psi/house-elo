/**
 * Pure rating engine. No database, no I/O.
 *
 * The entire ranking state of a game is a *projection* of its match log: feed
 * `replay()` the ordered list of matches and it produces every player's rating
 * plus the full per-match history. Nothing here mutates stored state, which is
 * what makes editing, voiding and back-dating matches — and swapping the rating
 * model outright — safe to do after the fact.
 */
import { rating, rate, ordinal, predictWin } from "openskill";

export const DEFAULT_MU = 25;
export const DEFAULT_SIGMA = DEFAULT_MU / 3;

/** Affine transform of the conservative estimate into familiar Elo-ish numbers. */
export const DISPLAY_SCALE = 40;
export const DISPLAY_BASE = 1000;

export type Rating = { mu: number; sigma: number };

/** One side of a match. `rank` is 1-based; equal ranks are a draw. */
export type MatchTeam = {
  rank: number;
  playerIds: string[];
};

export type MatchInput = {
  id: string;
  playedAt: Date | string;
  teams: MatchTeam[];
};

export type PlayerState = Rating & {
  playerId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
};

export type HistoryRow = {
  matchId: string;
  playerId: string;
  playedAt: Date;
  /** Rating *after* this match. */
  mu: number;
  sigma: number;
  /** Change in display rating produced by this match. */
  delta: number;
  outcome: Outcome;
  seq: number;
};

export type Outcome = "win" | "loss" | "draw";

export type ReplayResult = {
  states: Map<string, PlayerState>;
  history: HistoryRow[];
};

export function newRating(): Rating {
  return rating({ mu: DEFAULT_MU, sigma: DEFAULT_SIGMA });
}

/**
 * Conservative skill estimate (mu - 3*sigma), scaled so an unrated player sits
 * at exactly DISPLAY_BASE. Because it subtracts uncertainty, newcomers start
 * low and climb as the system gains confidence rather than arriving inflated.
 */
export function displayRating(r: Rating): number {
  return Math.round(ordinal(r) * DISPLAY_SCALE + DISPLAY_BASE);
}

/** Probability that `teamA` beats `teamB`, for pre-match odds and team balancing. */
export function winProbability(teamA: Rating[], teamB: Rating[]): number {
  if (teamA.length === 0 || teamB.length === 0) return 0.5;
  const [p] = predictWin([teamA, teamB]);
  return p;
}

/** Only the joint-best rank counts as a win; sharing it is a draw. */
function outcomeFor(rank: number, ranks: number[]): Outcome {
  const best = Math.min(...ranks);
  if (rank !== best) return "loss";
  return ranks.filter((r) => r === best).length > 1 ? "draw" : "win";
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Sort key for the replay. Ratings are path-dependent, so the order must be
 * total and stable — ties on timestamp fall back to match id.
 */
export function compareMatches(a: MatchInput, b: MatchInput): number {
  const at = toDate(a.playedAt).getTime();
  const bt = toDate(b.playedAt).getTime();
  if (at !== bt) return at - bt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * A match carries rating information as soon as two teams with players faced
 * each other. Identical ranks are *not* excluded: a draw is real evidence, and
 * pulls the two ratings toward each other while shrinking uncertainty.
 * Anything else is skipped rather than throwing, so one malformed row can never
 * make a game's leaderboard unrenderable.
 */
export function isRatable(match: MatchInput): boolean {
  return match.teams.filter((t) => t.playerIds.length > 0).length >= 2;
}

/**
 * Apply a single match to `states`, in place, returning its history rows.
 *
 * Shared by `replay` and by the incremental append path in the query layer, so
 * the two can never disagree about what a match does to a rating.
 */
export function applyMatch(
  states: Map<string, PlayerState>,
  match: MatchInput,
  seq: number,
): HistoryRow[] {
  const teams = match.teams.filter((t) => t.playerIds.length > 0);
  if (!isRatable(match)) return [];

  const playedAt = toDate(match.playedAt);
  const history: HistoryRow[] = [];

  // Snapshot pre-match display ratings so we can report per-match deltas.
  const before = new Map<string, number>();
  for (const team of teams) {
    for (const playerId of team.playerIds) {
      const state = states.get(playerId) ?? blankState(playerId);
      states.set(playerId, state);
      before.set(playerId, displayRating(state));
    }
  }

  const ratingTeams = teams.map((team) =>
    team.playerIds.map((playerId) => {
      const s = states.get(playerId)!;
      return { mu: s.mu, sigma: s.sigma };
    }),
  );
  const ranks = teams.map((t) => t.rank);
  const updated = rate(ratingTeams, { rank: ranks });

  teams.forEach((team, teamIndex) => {
    const outcome = outcomeFor(team.rank, ranks);
    team.playerIds.forEach((playerId, playerIndex) => {
      const next = updated[teamIndex][playerIndex];
      const prev = states.get(playerId)!;
      const state: PlayerState = {
        playerId,
        mu: next.mu,
        sigma: next.sigma,
        matchesPlayed: prev.matchesPlayed + 1,
        wins: prev.wins + (outcome === "win" ? 1 : 0),
        losses: prev.losses + (outcome === "loss" ? 1 : 0),
        draws: prev.draws + (outcome === "draw" ? 1 : 0),
      };
      states.set(playerId, state);
      history.push({
        matchId: match.id,
        playerId,
        playedAt,
        mu: state.mu,
        sigma: state.sigma,
        delta: displayRating(state) - (before.get(playerId) ?? DISPLAY_BASE),
        outcome,
        seq,
      });
    });
  });

  return history;
}

export function replay(matches: MatchInput[]): ReplayResult {
  const states = new Map<string, PlayerState>();
  const history: HistoryRow[] = [];

  const ordered = [...matches].sort(compareMatches);

  let seq = 0;
  for (const match of ordered) {
    if (!isRatable(match)) continue;
    seq += 1;
    history.push(...applyMatch(states, match, seq));
  }

  return { states, history };
}

function blankState(playerId: string): PlayerState {
  const r = newRating();
  return {
    playerId,
    mu: r.mu,
    sigma: r.sigma,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
  };
}

export function emptyState(playerId: string): PlayerState {
  return blankState(playerId);
}
