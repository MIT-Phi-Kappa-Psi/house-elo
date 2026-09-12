/**
 * Integration tests against a real Postgres.
 *
 * Skipped unless TEST_DATABASE_URL is set, so `npm test` stays runnable with no
 * database. See README for spinning up a throwaway instance.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { closeDriver, sql } from "../lib/db";
import { schemaStatements } from "../lib/schema";
import {
  createGame,
  createMatch,
  findOrCreatePlayer,
  getGame,
  getLeaderboard,
  getPlayerHistory,
  getTeammateConcentration,
  listGames,
  listMatches,
  listPlayerMatches,
  listPlayers,
  previewOdds,
  recomputeGame,
  setMatchVoided,
} from "../lib/queries";

const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : "set TEST_DATABASE_URL to run" };

// Exercises the real node-postgres driver from lib/db.ts, not a test double.
if (url) process.env.DATABASE_URL = url;

before(async () => {
  if (!url) return;
  for (const statement of schemaStatements()) {
    await sql().raw(statement);
  }
});

beforeEach(async () => {
  if (!url) return;
  await sql()`
    truncate rating_history, ratings, match_players, match_teams, matches, players, games
    restart identity cascade
  `;
});

after(async () => {
  if (!url) return;
  await closeDriver();
});

async function pool() {
  return createGame({
    name: "Pool",
    minTeamSize: 1,
    maxTeamSize: 1,
    teamsPerMatch: 2,
    allowsDraws: false,
  });
}

test("creating a game gives it a slug and makes it listable", opts, async () => {
  const game = await pool();
  assert.equal(game.slug, "pool");
  const found = await getGame("pool");
  assert.equal(found?.id, game.id);
  const all = await listGames();
  assert.equal(all.length, 1);
  assert.equal(all[0].matchCount, 0);
});

test("game slugs are de-duplicated", opts, async () => {
  await pool();
  const second = await pool();
  assert.equal(second.slug, "pool-2");
});

test("players are matched case-insensitively rather than duplicated", opts, async () => {
  const a = await findOrCreatePlayer("Jackson");
  const b = await findOrCreatePlayer("  jackson ");
  assert.equal(a.id, b.id);
  assert.equal((await listPlayers()).length, 1);
});

test("a logged match produces a leaderboard ordered by rating", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });

  const board = await getLeaderboard(game.id);
  assert.equal(board.length, 2);
  assert.equal(board[0].name, "A");
  assert.ok(board[0].displayRating > board[1].displayRating);
  assert.equal(board[0].wins, 1);
  assert.equal(board[1].losses, 1);
  assert.equal(board[0].provisional, true);
});

test("team matches round-trip with every player on the right side", opts, async () => {
  const game = await createGame({
    name: "Soccer",
    minTeamSize: 2,
    maxTeamSize: 3,
    teamsPerMatch: 2,
    allowsDraws: true,
  });
  const ids = [];
  for (const n of ["A", "B", "C", "D", "E"]) ids.push((await findOrCreatePlayer(n)).id);

  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: ids.slice(0, 3) },
      { rank: 2, playerIds: ids.slice(3, 5) },
    ],
  });

  const [match] = await listMatches(game.id);
  assert.equal(match.teams.length, 2);
  assert.equal(match.teams[0].players.length, 3);
  assert.equal(match.teams[1].players.length, 2);
  assert.equal((await getLeaderboard(game.id)).length, 5);
});

test("voiding a match removes its rating effect; restoring puts it back", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  const matchId = await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  const rated = (await getLeaderboard(game.id))[0].displayRating;

  await setMatchVoided(matchId, true);
  assert.equal((await getLeaderboard(game.id)).length, 0);

  await setMatchVoided(matchId, false);
  assert.equal((await getLeaderboard(game.id))[0].displayRating, rated);
});

test("a back-dated match reorders history and changes the outcome", opts, async () => {
  const game = await pool();
  const [a, b, c] = [
    await findOrCreatePlayer("A"),
    await findOrCreatePlayer("B"),
    await findOrCreatePlayer("C"),
  ];
  await createMatch({
    gameId: game.id,
    playedAt: new Date("2026-03-01"),
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  const before = (await getLeaderboard(game.id)).find((r) => r.name === "A")!.displayRating;

  // Insert a match that happened *earlier* than the one already recorded.
  await createMatch({
    gameId: game.id,
    playedAt: new Date("2026-01-01"),
    teams: [
      { rank: 1, playerIds: [c.id] },
      { rank: 2, playerIds: [a.id] },
    ],
  });

  const history = await getPlayerHistory(game.id, a.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].outcome, "loss", "the back-dated loss must come first");
  assert.equal(history[1].outcome, "win");
  assert.notEqual(
    (await getLeaderboard(game.id)).find((r) => r.name === "A")!.displayRating,
    before,
  );
});

test("recompute is idempotent", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  for (let i = 0; i < 6; i++) {
    await createMatch({
      gameId: game.id,
      playedAt: new Date(2026, 0, i + 1),
      teams: [
        { rank: 1, playerIds: [a.id] },
        { rank: 2, playerIds: [b.id] },
      ],
    });
  }
  const first = await getLeaderboard(game.id);
  await recomputeGame(game.id);
  await recomputeGame(game.id);
  assert.deepEqual(await getLeaderboard(game.id), first);
  assert.equal(first[0].provisional, false, "6 matches clears the provisional bar");
});

test("history rows carry a signed delta per match", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  const [entry] = await getPlayerHistory(game.id, a.id);
  assert.ok(entry.delta > 0);
  assert.equal(entry.outcome, "win");
  assert.equal(entry.seq, 1);
});

test("ratings are independent per game", opts, async () => {
  const p1 = await pool();
  const p2 = await createGame({
    name: "Darts",
    minTeamSize: 1,
    maxTeamSize: 1,
    teamsPerMatch: 2,
    allowsDraws: false,
  });
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  await createMatch({
    gameId: p1.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  assert.equal((await getLeaderboard(p1.id)).length, 2);
  assert.equal((await getLeaderboard(p2.id)).length, 0);
});

test("teammate concentration counts shared sides only", opts, async () => {
  const game = await createGame({
    name: "Doubles",
    minTeamSize: 2,
    maxTeamSize: 2,
    teamsPerMatch: 2,
    allowsDraws: false,
  });
  const ids: Record<string, string> = {};
  for (const n of ["A", "B", "C", "D"]) ids[n] = (await findOrCreatePlayer(n)).id;
  for (let i = 0; i < 3; i++) {
    await createMatch({
      gameId: game.id,
      playedAt: new Date(2026, 0, i + 1),
      teams: [
        { rank: 1, playerIds: [ids.A, ids.B] },
        { rank: 2, playerIds: [ids.C, ids.D] },
      ],
    });
  }
  const mates = await getTeammateConcentration(game.id, ids.A);
  assert.equal(mates.length, 1);
  assert.equal(mates[0].name, "B");
  assert.equal(mates[0].gamesTogether, 3);
});

test("player match list only returns that player's matches", opts, async () => {
  const game = await pool();
  const [a, b, c] = [
    await findOrCreatePlayer("A"),
    await findOrCreatePlayer("B"),
    await findOrCreatePlayer("C"),
  ];
  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 0, 1),
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 0, 2),
    teams: [
      { rank: 1, playerIds: [b.id] },
      { rank: 2, playerIds: [c.id] },
    ],
  });
  assert.equal((await listPlayerMatches(game.id, a.id)).length, 1);
  assert.equal((await listPlayerMatches(game.id, b.id)).length, 2);
});

test("odds preview is even for unrated players and favours the stronger side", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  assert.equal(await previewOdds(game.id, [[a.id], [b.id]]), 0.5);

  for (let i = 0; i < 10; i++) {
    await createMatch({
      gameId: game.id,
      playedAt: new Date(2026, 0, i + 1),
      teams: [
        { rank: 1, playerIds: [a.id] },
        { rank: 2, playerIds: [b.id] },
      ],
    });
  }
  assert.ok((await previewOdds(game.id, [[a.id], [b.id]]))! > 0.8);
});

test("a draw is stored and reflected in the record", opts, async () => {
  const game = await createGame({
    name: "Chess",
    minTeamSize: 1,
    maxTeamSize: 1,
    teamsPerMatch: 2,
    allowsDraws: true,
  });
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 1, playerIds: [b.id] },
    ],
  });
  const board = await getLeaderboard(game.id);
  assert.equal(board.length, 2);
  for (const row of board) {
    assert.equal(row.draws, 1);
    assert.equal(row.wins, 0);
    assert.equal(row.displayRating, board[0].displayRating);
  }
});
