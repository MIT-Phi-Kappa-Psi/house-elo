import { sql, q, slugify, type Row } from "./db";
import {
  TICKET_KINDS,
  TICKET_STATUSES,
  type Ticket,
  type TicketKind,
  type TicketStatus,
} from "./tickets";

export { TICKET_KINDS, TICKET_STATUSES };
export type { Ticket, TicketKind, TicketStatus };
import {
  applyMatch,
  replay,
  displayRating,
  emptyState,
  winProbability,
  type MatchInput,
  type Outcome,
  type PlayerState,
} from "./rating";

export type Game = {
  id: string;
  slug: string;
  name: string;
  minTeamSize: number;
  maxTeamSize: number;
  minTeamsPerMatch: number;
  maxTeamsPerMatch: number;
  allowsDraws: boolean;
};

export type Player = { id: string; slug: string; name: string };

export type LeaderboardRow = {
  playerId: string;
  slug: string;
  name: string;
  displayRating: number;
  mu: number;
  sigma: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  provisional: boolean;
};

export type MatchTeamView = {
  teamIndex: number;
  rank: number;
  score: number | null;
  nakedLap: boolean;
  players: Player[];
};

export type PlayerDirectoryRow = Player & {
  matchesPlayed: number;
  gamesPlayed: number;
  nakedLaps: number;
  lastPlayed: Date | null;
};

export type MergeConflict = {
  matchId: string;
  playedAt: Date;
  gameName: string;
  gameSlug: string;
  sameTeam: boolean;
};

export type MatchView = {
  id: string;
  playedAt: Date;
  note: string | null;
  voided: boolean;
  teams: MatchTeamView[];
};

/** Matches below this count keep a player off the main leaderboard. */
export const PROVISIONAL_MATCHES = 5;

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

function toGame(row: Row): Game {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    minTeamSize: Number(row.min_team_size),
    maxTeamSize: Number(row.max_team_size),
    minTeamsPerMatch: Number(row.teams_per_match),
    maxTeamsPerMatch: Number(row.max_teams_per_match ?? row.teams_per_match),
    allowsDraws: Boolean(row.allows_draws),
  };
}

/**
 * Games ordered by how active they have been in the last seven days, so the
 * board reflects what the house is currently playing. The recent count is only
 * a sort key and is never shown; ties fall back to lifetime matches, then name,
 * which keeps the order total and stable rather than arbitrary.
 */
export async function listGames(): Promise<
  (Game & { matchCount: number; playerCount: number })[]
> {
  const rows = await q`
    select g.*,
           (select count(*) from matches m
             where m.game_id = g.id and not m.voided) as match_count,
           (select count(*) from matches m
             where m.game_id = g.id and not m.voided
               and m.played_at >= now() - interval '7 days') as recent_count,
           (select count(*) from ratings r where r.game_id = g.id) as player_count
    from games g
    order by recent_count desc, match_count desc, g.name asc
  `;
  return rows.map((r) => ({
    ...toGame(r),
    matchCount: Number(r.match_count),
    playerCount: Number(r.player_count),
  }));
}

export async function getGame(slug: string): Promise<Game | null> {
  const rows = await q`select * from games where slug = ${slug} limit 1`;
  return rows.length ? toGame(rows[0]) : null;
}

export async function listPlayers(): Promise<Player[]> {
  const rows = await q`select id, slug, name from players order by name asc`;
  return rows as Player[];
}

export async function getPlayerBySlug(slug: string): Promise<Player | null> {
  const rows = await q`select id, slug, name from players where slug = ${slug} limit 1`;
  return rows.length ? (rows[0] as Player) : null;
}

/**
 * Every player, ranked by naked laps — the house's leaderboard of shame.
 *
 * Both counts join through `matches` so voided matches are excluded; counting
 * `match_players` directly would keep tallying rows whose match was voided.
 */
export async function listPlayerDirectory(): Promise<PlayerDirectoryRow[]> {
  const rows = await q`
    select p.id, p.slug, p.name,
           count(m.id)::int                                       as matches_played,
           count(distinct m.game_id)::int                         as games_played,
           count(*) filter (where mt.naked_lap)::int              as naked_laps,
           max(m.played_at)                                       as last_played
    from players p
    left join match_players mp on mp.player_id = p.id
    left join matches m on m.id = mp.match_id and not m.voided
    left join match_teams mt
      on mt.match_id = m.id and mt.team_index = mp.team_index
    group by p.id, p.slug, p.name
    order by naked_laps desc, matches_played desc, p.name asc
  `;
  return rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    matchesPlayed: Number(r.matches_played),
    gamesPlayed: Number(r.games_played),
    nakedLaps: Number(r.naked_laps),
    lastPlayed: r.last_played ? new Date(r.last_played as string) : null,
  }));
}

/** Case-insensitive lookup that does not create. */
export async function findPlayerByName(name: string): Promise<Player | null> {
  const rows = await q`
    select id, slug, name from players where lower(name) = lower(${name.trim()}) limit 1
  `;
  return rows.length ? (rows[0] as Player) : null;
}

export async function getPlayerById(id: string): Promise<Player | null> {
  const rows = await q`select id, slug, name from players where id = ${id} limit 1`;
  return rows.length ? (rows[0] as Player) : null;
}

export async function renamePlayer(id: string, name: string): Promise<void> {
  await q`update players set name = ${name.trim()} where id = ${id}`;
}

/**
 * Matches where both players already appear. Merging these would put one person
 * on both sides of a result, or silently shrink a team, so a merge that hits
 * any of them is refused rather than guessed at.
 */
export async function findMergeConflicts(
  sourceId: string,
  targetId: string,
): Promise<MergeConflict[]> {
  const rows = await q`
    select m.id, m.played_at, g.name as game_name, g.slug as game_slug,
           (a.team_index = b.team_index) as same_team
    from match_players a
    join match_players b on b.match_id = a.match_id
    join matches m on m.id = a.match_id
    join games g on g.id = m.game_id
    where a.player_id = ${sourceId} and b.player_id = ${targetId}
    order by m.played_at desc
  `;
  return rows.map((r) => ({
    matchId: r.id as string,
    playedAt: new Date(r.played_at as string),
    gameName: r.game_name as string,
    gameSlug: r.game_slug as string,
    sameTeam: Boolean(r.same_team),
  }));
}

/**
 * Fold `sourceId` into `targetId`: every appearance is reassigned, the
 * duplicate row is removed, and each affected game's ratings are replayed. The
 * target's name survives.
 */
export async function mergePlayers(
  sourceId: string,
  targetId: string,
): Promise<{ gamesRecomputed: number; matchesMoved: number }> {
  if (sourceId === targetId) throw new Error("Cannot merge a player into itself");

  const conflicts = await findMergeConflicts(sourceId, targetId);
  if (conflicts.length > 0) {
    throw new Error(
      `Both players appear in ${conflicts.length} of the same match(es); ` +
        "merging would put one person on both sides.",
    );
  }

  // Collect affected games before the reassignment changes what is reachable.
  const gameRows = await q`
    select distinct m.game_id
    from match_players mp
    join matches m on m.id = mp.match_id
    where mp.player_id = ${sourceId} or mp.player_id = ${targetId}
  `;
  const gameIds = gameRows.map((r) => r.game_id as string);

  const moved = await q`
    update match_players set player_id = ${targetId}
    where player_id = ${sourceId}
    returning match_id
  `;

  await sql().transaction([
    sql()`delete from ratings where player_id = ${sourceId}`,
    sql()`delete from rating_history where player_id = ${sourceId}`,
    sql()`delete from players where id = ${sourceId}`,
  ]);

  for (const gameId of gameIds) await recomputeGame(gameId);

  return { gamesRecomputed: gameIds.length, matchesMoved: moved.length };
}

export async function getLeaderboard(gameId: string): Promise<LeaderboardRow[]> {
  const rows = await q`
    select r.*, p.slug, p.name
    from ratings r
    join players p on p.id = r.player_id
    where r.game_id = ${gameId}
    order by (r.mu - 3 * r.sigma) desc, p.name asc
  `;
  return rows.map((r) => {
    const mu = Number(r.mu);
    const sigma = Number(r.sigma);
    return {
      playerId: r.player_id as string,
      slug: r.slug as string,
      name: r.name as string,
      mu,
      sigma,
      displayRating: displayRating({ mu, sigma }),
      matchesPlayed: Number(r.matches_played),
      wins: Number(r.wins),
      losses: Number(r.losses),
      draws: Number(r.draws),
      provisional: Number(r.matches_played) < PROVISIONAL_MATCHES,
    };
  });
}

export async function listMatches(gameId: string, limit = 50): Promise<MatchView[]> {
  const rows = await q`
    select m.id, m.played_at, m.note, m.voided,
           mt.team_index, mt.rank, mt.score, mt.naked_lap,
           p.id as player_id, p.slug as player_slug, p.name as player_name
    from matches m
    join match_teams mt on mt.match_id = m.id
    left join match_players mp on mp.match_id = m.id and mp.team_index = mt.team_index
    left join players p on p.id = mp.player_id
    where m.game_id = ${gameId}
      and m.id in (
        select id from matches where game_id = ${gameId}
        order by played_at desc, id desc limit ${limit}
      )
    order by m.played_at desc, m.id desc, mt.rank asc, mt.team_index asc, p.name asc
  `;
  return groupMatches(rows);
}

export async function listPlayerMatches(gameId: string, playerId: string, limit = 100) {
  const rows = await q`
    select m.id, m.played_at, m.note, m.voided,
           mt.team_index, mt.rank, mt.score, mt.naked_lap,
           p.id as player_id, p.slug as player_slug, p.name as player_name
    from matches m
    join match_teams mt on mt.match_id = m.id
    left join match_players mp on mp.match_id = m.id and mp.team_index = mt.team_index
    left join players p on p.id = mp.player_id
    where m.game_id = ${gameId}
      and m.id in (
        select mp2.match_id from match_players mp2
        join matches m2 on m2.id = mp2.match_id
        where mp2.player_id = ${playerId} and m2.game_id = ${gameId}
        order by m2.played_at desc limit ${limit}
      )
    order by m.played_at desc, m.id desc, mt.rank asc, mt.team_index asc, p.name asc
  `;
  return groupMatches(rows);
}

export async function getPlayerHistory(gameId: string, playerId: string) {
  const rows = await q`
    select match_id, played_at, seq, mu, sigma, delta, outcome
    from rating_history
    where game_id = ${gameId} and player_id = ${playerId}
    order by seq asc
  `;
  return rows.map((r) => ({
    matchId: r.match_id as string,
    playedAt: new Date(r.played_at as string),
    seq: Number(r.seq),
    mu: Number(r.mu),
    sigma: Number(r.sigma),
    delta: Number(r.delta),
    outcome: r.outcome as Outcome,
    displayRating: displayRating({ mu: Number(r.mu), sigma: Number(r.sigma) }),
  }));
}

/**
 * Frequency of teammate pairings. Surfaces the case where two players are
 * effectively always on the same side, which the rating model cannot separate.
 */
export async function getTeammateConcentration(gameId: string, playerId: string) {
  const rows = await q`
    select p.name, p.slug, count(*)::int as games_together
    from match_players me
    join match_players other
      on other.match_id = me.match_id
     and other.team_index = me.team_index
     and other.player_id <> me.player_id
    join matches m on m.id = me.match_id and not m.voided
    join players p on p.id = other.player_id
    where me.player_id = ${playerId} and m.game_id = ${gameId}
    group by p.name, p.slug
    order by games_together desc
    limit 5
  `;
  return rows.map((r) => ({
    name: r.name as string,
    slug: r.slug as string,
    gamesTogether: Number(r.games_together),
  }));
}

function groupMatches(rows: Row[]): MatchView[] {
  const byMatch = new Map<string, MatchView>();
  for (const row of rows) {
    const id = row.id as string;
    let match = byMatch.get(id);
    if (!match) {
      match = {
        id,
        playedAt: new Date(row.played_at as string),
        note: (row.note as string | null) ?? null,
        voided: Boolean(row.voided),
        teams: [],
      };
      byMatch.set(id, match);
    }
    const teamIndex = Number(row.team_index);
    let team = match.teams.find((t) => t.teamIndex === teamIndex);
    if (!team) {
      team = {
        teamIndex,
        rank: Number(row.rank),
        score: row.score === null || row.score === undefined ? null : Number(row.score),
        nakedLap: Boolean(row.naked_lap),
        players: [],
      };
      match.teams.push(team);
    }
    if (row.player_id) {
      team.players.push({
        id: row.player_id as string,
        slug: row.player_slug as string,
        name: row.player_name as string,
      });
    }
  }
  for (const match of byMatch.values()) {
    match.teams.sort((a, b) => a.rank - b.rank || a.teamIndex - b.teamIndex);
  }
  return [...byMatch.values()];
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export async function createGame(input: {
  name: string;
  minTeamSize: number;
  maxTeamSize: number;
  minTeamsPerMatch: number;
  maxTeamsPerMatch: number;
  allowsDraws: boolean;
}): Promise<Game> {
  const slug = await uniqueSlug("games", slugify(input.name));
  const rows = await q`
    insert into games
      (slug, name, min_team_size, max_team_size, teams_per_match,
       max_teams_per_match, allows_draws)
    values (${slug}, ${input.name}, ${input.minTeamSize}, ${input.maxTeamSize},
            ${input.minTeamsPerMatch}, ${input.maxTeamsPerMatch}, ${input.allowsDraws})
    returning *
  `;
  return toGame(rows[0]);
}

export async function findOrCreatePlayer(name: string): Promise<Player> {
  const trimmed = name.trim();
  const existing = await q`
    select id, slug, name from players where lower(name) = lower(${trimmed}) limit 1
  `;
  if (existing.length) return existing[0] as Player;

  const slug = await uniqueSlug("players", slugify(trimmed));
  const rows = await q`
    insert into players (slug, name) values (${slug}, ${trimmed})
    returning id, slug, name
  `;
  return rows[0] as Player;
}

export async function createMatch(input: {
  gameId: string;
  playedAt?: Date;
  note?: string | null;
  teams: {
    rank: number;
    playerIds: string[];
    score?: number | null;
    nakedLap?: boolean;
  }[];
}): Promise<string> {
  const playedAt = input.playedAt ?? new Date();
  const inserted = await q`
    insert into matches (game_id, played_at, note)
    values (${input.gameId}, ${playedAt.toISOString()}, ${input.note ?? null})
    returning id
  `;
  const matchId = inserted[0].id as string;

  const statements = [];
  for (const [teamIndex, team] of input.teams.entries()) {
    statements.push(sql()`
      insert into match_teams (match_id, team_index, rank, score, naked_lap)
      values (${matchId}, ${teamIndex}, ${team.rank}, ${team.score ?? null},
              ${team.nakedLap ?? false})
    `);
  }
  await sql().transaction(statements);

  const playerStatements = [];
  for (const [teamIndex, team] of input.teams.entries()) {
    for (const playerId of team.playerIds) {
      playerStatements.push(sql()`
        insert into match_players (match_id, team_index, player_id)
        values (${matchId}, ${teamIndex}, ${playerId})
      `);
    }
  }
  if (playerStatements.length) await sql().transaction(playerStatements);

  await applyNewMatch(input.gameId, matchId, playedAt);
  return matchId;
}

/**
 * Rate a freshly inserted match.
 *
 * A match appended at the end of the log only affects the players in it, so we
 * write those rows and stop. Rewriting the whole projection on every insert —
 * which is what a full replay does — costs O(matches^2) row writes over a
 * game's life and leaves the derived tables mostly dead tuples, which matters
 * on a storage-capped database. Anything back-dated still falls back to the
 * full replay, because it changes the ratings of every match after it.
 */
async function applyNewMatch(
  gameId: string,
  matchId: string,
  playedAt: Date,
): Promise<void> {
  const later = await q`
    select 1 from matches
    where game_id = ${gameId} and not voided and id <> ${matchId}
      and (played_at, id) > (${playedAt.toISOString()}, ${matchId}::uuid)
    limit 1
  `;
  if (later.length > 0) {
    await recomputeGame(gameId);
    return;
  }

  const rows = await q`
    select mt.team_index, mt.rank, mp.player_id
    from match_teams mt
    left join match_players mp
      on mp.match_id = mt.match_id and mp.team_index = mt.team_index
    where mt.match_id = ${matchId}
    order by mt.team_index asc
  `;

  const match: MatchInput = { id: matchId, playedAt, teams: [] };
  for (const row of rows) {
    const teamIndex = Number(row.team_index);
    while (match.teams.length <= teamIndex) match.teams.push({ rank: 0, playerIds: [] });
    match.teams[teamIndex].rank = Number(row.rank);
    if (row.player_id) match.teams[teamIndex].playerIds.push(row.player_id as string);
  }

  const playerIds = match.teams.flatMap((t) => t.playerIds);
  if (playerIds.length === 0) return;

  const [existing, seqRow] = await Promise.all([
    q`
      select player_id, mu, sigma, matches_played, wins, losses, draws
      from ratings
      where game_id = ${gameId} and player_id = any(${playerIds}::uuid[])
    `,
    q`select coalesce(max(seq), 0) as seq from rating_history where game_id = ${gameId}`,
  ]);

  const states = new Map<string, PlayerState>(
    existing.map((r) => [
      r.player_id as string,
      {
        playerId: r.player_id as string,
        mu: Number(r.mu),
        sigma: Number(r.sigma),
        matchesPlayed: Number(r.matches_played),
        wins: Number(r.wins),
        losses: Number(r.losses),
        draws: Number(r.draws),
      },
    ]),
  );

  const history = applyMatch(states, match, Number(seqRow[0].seq) + 1);
  if (history.length === 0) return;

  const touched = [...states.values()].filter((s) => playerIds.includes(s.playerId));

  await sql().transaction([
    sql()`
      insert into ratings
        (game_id, player_id, mu, sigma, matches_played, wins, losses, draws, updated_at)
      select ${gameId}, t.player_id::uuid, t.mu, t.sigma,
             t.matches_played, t.wins, t.losses, t.draws, now()
      from unnest(
        ${touched.map((x) => x.playerId)}::text[],
        ${touched.map((x) => x.mu)}::double precision[],
        ${touched.map((x) => x.sigma)}::double precision[],
        ${touched.map((x) => x.matchesPlayed)}::int[],
        ${touched.map((x) => x.wins)}::int[],
        ${touched.map((x) => x.losses)}::int[],
        ${touched.map((x) => x.draws)}::int[]
      ) as t(player_id, mu, sigma, matches_played, wins, losses, draws)
      on conflict (game_id, player_id) do update set
        mu = excluded.mu, sigma = excluded.sigma,
        matches_played = excluded.matches_played, wins = excluded.wins,
        losses = excluded.losses, draws = excluded.draws,
        updated_at = now()
    `,
    sql()`
      insert into rating_history
        (game_id, player_id, match_id, played_at, seq, mu, sigma, delta, outcome)
      select ${gameId}, t.player_id::uuid, t.match_id::uuid, t.played_at,
             t.seq, t.mu, t.sigma, t.delta, t.outcome
      from unnest(
        ${history.map((h) => h.playerId)}::text[],
        ${history.map((h) => h.matchId)}::text[],
        ${history.map((h) => h.playedAt.toISOString())}::timestamptz[],
        ${history.map((h) => h.seq)}::int[],
        ${history.map((h) => h.mu)}::double precision[],
        ${history.map((h) => h.sigma)}::double precision[],
        ${history.map((h) => h.delta)}::int[],
        ${history.map((h) => h.outcome)}::text[]
      ) as t(player_id, match_id, played_at, seq, mu, sigma, delta, outcome)
      on conflict (match_id, player_id) do nothing
    `,
  ]);
}

export async function setMatchVoided(matchId: string, voided: boolean): Promise<string> {
  const rows = await q`
    update matches set voided = ${voided} where id = ${matchId} returning game_id
  `;
  if (!rows.length) throw new Error("Match not found");
  const gameId = rows[0].game_id as string;
  await recomputeGame(gameId);
  return gameId;
}

/* -------------------------------------------------------------------------- */
/* Rating projection                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Rebuild a game's ratings from scratch by replaying its match log.
 *
 * This is the definition of correctness for the whole system: the derived
 * tables are dropped and rewritten, so voiding, back-dating or re-entering a
 * match — or changing the rating model entirely — needs no migration and
 * leaves no drift behind.
 */
export async function recomputeGame(gameId: string): Promise<void> {
  const rows = await q`
    select m.id, m.played_at, mt.team_index, mt.rank, mp.player_id
    from matches m
    join match_teams mt on mt.match_id = m.id
    left join match_players mp on mp.match_id = m.id and mp.team_index = mt.team_index
    where m.game_id = ${gameId} and not m.voided
    order by m.played_at asc, m.id asc, mt.team_index asc
  `;

  const matches = new Map<string, MatchInput>();
  for (const row of rows) {
    const id = row.id as string;
    let match = matches.get(id);
    if (!match) {
      match = { id, playedAt: new Date(row.played_at as string), teams: [] };
      matches.set(id, match);
    }
    const teamIndex = Number(row.team_index);
    while (match.teams.length <= teamIndex) {
      match.teams.push({ rank: 0, playerIds: [] });
    }
    match.teams[teamIndex].rank = Number(row.rank);
    if (row.player_id) match.teams[teamIndex].playerIds.push(row.player_id as string);
  }

  const { states, history } = replay([...matches.values()]);

  const statements = [
    sql()`delete from rating_history where game_id = ${gameId}`,
    sql()`delete from ratings where game_id = ${gameId}`,
  ];

  if (states.size > 0) {
    const s = [...states.values()];
    statements.push(sql()`
      insert into ratings
        (game_id, player_id, mu, sigma, matches_played, wins, losses, draws, updated_at)
      select ${gameId}, t.player_id::uuid, t.mu, t.sigma,
             t.matches_played, t.wins, t.losses, t.draws, now()
      from unnest(
        ${s.map((x) => x.playerId)}::text[],
        ${s.map((x) => x.mu)}::double precision[],
        ${s.map((x) => x.sigma)}::double precision[],
        ${s.map((x) => x.matchesPlayed)}::int[],
        ${s.map((x) => x.wins)}::int[],
        ${s.map((x) => x.losses)}::int[],
        ${s.map((x) => x.draws)}::int[]
      ) as t(player_id, mu, sigma, matches_played, wins, losses, draws)
    `);
  }

  if (history.length > 0) {
    statements.push(sql()`
      insert into rating_history
        (game_id, player_id, match_id, played_at, seq, mu, sigma, delta, outcome)
      select ${gameId}, t.player_id::uuid, t.match_id::uuid, t.played_at,
             t.seq, t.mu, t.sigma, t.delta, t.outcome
      from unnest(
        ${history.map((h) => h.playerId)}::text[],
        ${history.map((h) => h.matchId)}::text[],
        ${history.map((h) => h.playedAt.toISOString())}::timestamptz[],
        ${history.map((h) => h.seq)}::int[],
        ${history.map((h) => h.mu)}::double precision[],
        ${history.map((h) => h.sigma)}::double precision[],
        ${history.map((h) => h.delta)}::int[],
        ${history.map((h) => h.outcome)}::text[]
      ) as t(player_id, match_id, played_at, seq, mu, sigma, delta, outcome)
    `);
  }

  await sql().transaction(statements);
}

/** Pre-match odds for a proposed lineup, using current ratings. */
export async function previewOdds(
  gameId: string,
  teamPlayerIds: string[][],
): Promise<number | null> {
  if (teamPlayerIds.length !== 2) return null;
  if (teamPlayerIds.some((t) => t.length === 0)) return null;
  const ids = teamPlayerIds.flat();
  const rows = await q`
    select player_id, mu, sigma from ratings
    where game_id = ${gameId} and player_id = any(${ids}::uuid[])
  `;
  const byId = new Map(
    rows.map((r) => [r.player_id as string, { mu: Number(r.mu), sigma: Number(r.sigma) }]),
  );
  const teams = teamPlayerIds.map((team) =>
    team.map((id) => byId.get(id) ?? emptyState(id)),
  );
  return winProbability(teams[0], teams[1]);
}

async function uniqueSlug(table: "games" | "players", base: string): Promise<string> {
  const rows =
    table === "games"
      ? await q`select slug from games where slug = ${base} or slug like ${base + "-%"}`
      : await q`select slug from players where slug = ${base} or slug like ${base + "-%"}`;
  const taken = new Set(rows.map((r) => r.slug as string));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/* -------------------------------------------------------------------------- */
/* Tickets                                                                     */
/* -------------------------------------------------------------------------- */

function toTicket(row: Row): Ticket {
  return {
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    reporter: (row.reporter as string | null) ?? null,
    kind: row.kind as TicketKind,
    status: row.status as TicketStatus,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listTickets(): Promise<Ticket[]> {
  const rows = await q`
    select * from tickets
    order by
      -- Untriaged first, settled last; newest within each group.
      case status
        when 'open' then 0
        when 'planned' then 1
        when 'done' then 2
        else 3
      end,
      created_at desc
  `;
  return rows.map(toTicket);
}

export async function createTicket(input: {
  title: string;
  body?: string | null;
  reporter?: string | null;
  kind: TicketKind;
}): Promise<Ticket> {
  const rows = await q`
    insert into tickets (title, body, reporter, kind)
    values (${input.title}, ${input.body ?? null}, ${input.reporter ?? null},
            ${input.kind})
    returning *
  `;
  return toTicket(rows[0]);
}

export async function setTicketStatus(
  id: string,
  status: TicketStatus,
): Promise<void> {
  await q`
    update tickets set status = ${status}, updated_at = now() where id = ${id}
  `;
}

export async function deleteTicket(id: string): Promise<void> {
  await q`delete from tickets where id = ${id}`;
}
