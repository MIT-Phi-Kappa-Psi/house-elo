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
  listPlayerDirectory,
  listPlayers,
  findMergeConflicts,
  findPlayerByName,
  mergePlayers,
  renamePlayer,
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

test("appending matches incrementally matches a full replay exactly", opts, async () => {
  const game = await createGame({
    name: "Incremental",
    minTeamSize: 1,
    maxTeamSize: 2,
    teamsPerMatch: 2,
    allowsDraws: true,
  });
  const ids: string[] = [];
  for (const n of ["A", "B", "C", "D", "E", "F"]) {
    ids.push((await findOrCreatePlayer(n)).id);
  }

  // Mixed shapes: 1v1, 2v2, uneven, and a draw — all appended in order, so
  // every insert takes the incremental path.
  const shapes: [number[], number[], number, number][] = [
    [[0], [1], 1, 2],
    [[0, 1], [2, 3], 1, 2],
    [[4], [5], 2, 1],
    [[0, 2], [4], 1, 2],
    [[1], [3], 1, 1],
    [[2, 3], [4, 5], 2, 1],
  ];
  for (const [i, [left, right, lr, rr]] of shapes.entries()) {
    await createMatch({
      gameId: game.id,
      playedAt: new Date(2026, 0, i + 1),
      teams: [
        { rank: lr, playerIds: left.map((n) => ids[n]) },
        { rank: rr, playerIds: right.map((n) => ids[n]) },
      ],
    });
  }

  const incremental = await getLeaderboard(game.id);
  const incrementalHistory = await getPlayerHistory(game.id, ids[0]);

  // Force the authoritative path and compare.
  await recomputeGame(game.id);
  assert.deepEqual(await getLeaderboard(game.id), incremental);
  assert.deepEqual(await getPlayerHistory(game.id, ids[0]), incrementalHistory);
});

test("a back-dated insert falls back to the full replay", opts, async () => {
  const game = await pool();
  const [a, b, c] = [
    await findOrCreatePlayer("A"),
    await findOrCreatePlayer("B"),
    await findOrCreatePlayer("C"),
  ];
  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 5, 1),
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 0, 1),
    teams: [
      { rank: 1, playerIds: [c.id] },
      { rank: 2, playerIds: [a.id] },
    ],
  });

  const afterInsert = await getLeaderboard(game.id);
  await recomputeGame(game.id);
  assert.deepEqual(await getLeaderboard(game.id), afterInsert);

  // Sequence numbers must follow chronology, not insertion order.
  const history = await getPlayerHistory(game.id, a.id);
  assert.deepEqual(
    history.map((h) => h.outcome),
    ["loss", "win"],
  );
  assert.deepEqual(
    history.map((h) => h.seq),
    [1, 2],
  );
});

test("appending writes only the rows for players in that match", opts, async () => {
  const game = await pool();
  const [a, b, c, d] = [
    await findOrCreatePlayer("A"),
    await findOrCreatePlayer("B"),
    await findOrCreatePlayer("C"),
    await findOrCreatePlayer("D"),
  ];
  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 0, 1),
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  const untouched = await sql()`
    select updated_at from ratings where game_id = ${game.id} and player_id = ${a.id}
  `;

  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 0, 2),
    teams: [
      { rank: 1, playerIds: [c.id] },
      { rank: 2, playerIds: [d.id] },
    ],
  });

  const after = await sql()`
    select updated_at from ratings where game_id = ${game.id} and player_id = ${a.id}
  `;
  assert.deepEqual(
    after[0].updated_at,
    untouched[0].updated_at,
    "a player not in the match must not have their row rewritten",
  );
  assert.equal((await getLeaderboard(game.id)).length, 4);
});

test("a naked lap is stored on the team and read back with the match", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id], nakedLap: true },
    ],
  });

  const [match] = await listMatches(game.id);
  const winner = match.teams.find((t) => t.rank === 1)!;
  const loser = match.teams.find((t) => t.rank === 2)!;
  assert.equal(winner.nakedLap, false);
  assert.equal(loser.nakedLap, true);
});

test("players are ranked by naked laps, most first", opts, async () => {
  const game = await pool();
  const [a, b, c] = [
    await findOrCreatePlayer("A"),
    await findOrCreatePlayer("B"),
    await findOrCreatePlayer("C"),
  ];
  // B earns two laps, A one, C none.
  for (const [loser, lap] of [
    [b, true],
    [b, true],
    [a, true],
    [c, false],
  ] as const) {
    await createMatch({
      gameId: game.id,
      playedAt: new Date(2026, 0, Math.floor(Math.random() * 28) + 1),
      teams: [
        { rank: 1, playerIds: [loser.id === a.id ? b.id : a.id] },
        { rank: 2, playerIds: [loser.id], nakedLap: lap },
      ],
    });
  }

  const directory = await listPlayerDirectory();
  assert.equal(directory[0].name, "B");
  assert.equal(directory[0].nakedLaps, 2);
  assert.equal(directory.find((p) => p.name === "A")!.nakedLaps, 1);
  assert.equal(directory.find((p) => p.name === "C")!.nakedLaps, 0);
});

test("every member of a team shares its naked lap", opts, async () => {
  const game = await createGame({
    name: "Doubles",
    minTeamSize: 2,
    maxTeamSize: 2,
    teamsPerMatch: 2,
    allowsDraws: false,
  });
  const ids: Record<string, string> = {};
  for (const n of ["A", "B", "C", "D"]) ids[n] = (await findOrCreatePlayer(n)).id;
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [ids.A, ids.B] },
      { rank: 2, playerIds: [ids.C, ids.D], nakedLap: true },
    ],
  });

  const directory = await listPlayerDirectory();
  assert.equal(directory.find((p) => p.name === "C")!.nakedLaps, 1);
  assert.equal(directory.find((p) => p.name === "D")!.nakedLaps, 1);
  assert.equal(directory.find((p) => p.name === "A")!.nakedLaps, 0);
});

test("voiding a match withdraws its naked laps and match count", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  const matchId = await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id], nakedLap: true },
    ],
  });
  assert.equal(
    (await listPlayerDirectory()).find((p) => p.name === "B")!.nakedLaps,
    1,
  );

  await setMatchVoided(matchId, true);
  const after = (await listPlayerDirectory()).find((p) => p.name === "B")!;
  assert.equal(after.nakedLaps, 0, "a voided match owes nothing");
  assert.equal(after.matchesPlayed, 0);
});

test("merging duplicates sums their naked laps onto the survivor", opts, async () => {
  const game = await pool();
  const [real, typo, foe] = [
    await findOrCreatePlayer("Jackson"),
    await findOrCreatePlayer("Jakcson"),
    await findOrCreatePlayer("Foe"),
  ];
  for (const loser of [real, typo]) {
    await createMatch({
      gameId: game.id,
      playedAt: new Date(2026, 0, loser === real ? 1 : 2),
      teams: [
        { rank: 1, playerIds: [foe.id] },
        { rank: 2, playerIds: [loser.id], nakedLap: true },
      ],
    });
  }

  await mergePlayers(typo.id, real.id);
  const merged = (await listPlayerDirectory()).find((p) => p.name === "Jackson")!;
  assert.equal(merged.nakedLaps, 2);
});

test("the player directory lists everyone with their activity", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  await findOrCreatePlayer("NeverPlayed");
  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 0, 5),
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });

  const directory = await listPlayerDirectory();
  assert.equal(directory.length, 3);

  const played = directory.find((p) => p.name === "A")!;
  assert.equal(played.matchesPlayed, 1);
  assert.equal(played.gamesPlayed, 1);
  assert.ok(played.lastPlayed);

  const idle = directory.find((p) => p.name === "NeverPlayed")!;
  assert.equal(idle.matchesPlayed, 0);
  assert.equal(idle.lastPlayed, null);
});

test("merging moves matches and deletes the duplicate", opts, async () => {
  const game = await pool();
  const [jackson, typo, sam] = [
    await findOrCreatePlayer("Jackson"),
    await findOrCreatePlayer("Jakcson"),
    await findOrCreatePlayer("Sam"),
  ];

  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 0, 1),
    teams: [
      { rank: 1, playerIds: [jackson.id] },
      { rank: 2, playerIds: [sam.id] },
    ],
  });
  await createMatch({
    gameId: game.id,
    playedAt: new Date(2026, 0, 2),
    teams: [
      { rank: 1, playerIds: [typo.id] },
      { rank: 2, playerIds: [sam.id] },
    ],
  });

  assert.equal((await getLeaderboard(game.id)).length, 3);

  const result = await mergePlayers(typo.id, jackson.id);
  assert.equal(result.matchesMoved, 1);
  assert.equal(result.gamesRecomputed, 1);

  assert.equal(await findPlayerByName("Jakcson"), null);
  const board = await getLeaderboard(game.id);
  assert.equal(board.length, 2);
  const merged = board.find((r) => r.name === "Jackson")!;
  assert.equal(merged.wins, 2, "both wins now belong to one player");
  assert.equal(merged.matchesPlayed, 2);
});

test("a merge produces the same ratings as if one name had been used all along", opts, async () => {
  const clean = await pool();
  const messy = await createGame({
    name: "Messy",
    minTeamSize: 1,
    maxTeamSize: 1,
    teamsPerMatch: 2,
    allowsDraws: false,
  });

  const [one, other] = [await findOrCreatePlayer("One"), await findOrCreatePlayer("Other")];
  const [right, typo, otherB] = [
    await findOrCreatePlayer("Right"),
    await findOrCreatePlayer("Rihgt"),
    await findOrCreatePlayer("OtherB"),
  ];

  for (let i = 0; i < 6; i++) {
    const day = new Date(2026, 0, i + 1);
    await createMatch({
      gameId: clean.id,
      playedAt: day,
      teams: [
        { rank: 1, playerIds: [one.id] },
        { rank: 2, playerIds: [other.id] },
      ],
    });
    // Same results, but the winner's name alternates between two spellings.
    await createMatch({
      gameId: messy.id,
      playedAt: day,
      teams: [
        { rank: 1, playerIds: [i % 2 === 0 ? right.id : typo.id] },
        { rank: 2, playerIds: [otherB.id] },
      ],
    });
  }

  await mergePlayers(typo.id, right.id);

  const expected = (await getLeaderboard(clean.id)).find((r) => r.name === "One")!;
  const actual = (await getLeaderboard(messy.id)).find((r) => r.name === "Right")!;
  assert.equal(actual.displayRating, expected.displayRating);
  assert.equal(actual.matchesPlayed, expected.matchesPlayed);
});

test("merging two players who faced each other is refused", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });

  const conflicts = await findMergeConflicts(a.id, b.id);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].sameTeam, false);

  await assert.rejects(() => mergePlayers(a.id, b.id), /same match/i);
  // Nothing was changed by the refusal.
  assert.equal((await getLeaderboard(game.id)).length, 2);
  assert.ok(await findPlayerByName("A"));
});

test("merging two players who shared a team is refused", opts, async () => {
  const game = await createGame({
    name: "Doubles",
    minTeamSize: 2,
    maxTeamSize: 2,
    teamsPerMatch: 2,
    allowsDraws: false,
  });
  const ids: Record<string, string> = {};
  for (const n of ["A", "B", "C", "D"]) ids[n] = (await findOrCreatePlayer(n)).id;
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [ids.A, ids.B] },
      { rank: 2, playerIds: [ids.C, ids.D] },
    ],
  });

  const conflicts = await findMergeConflicts(ids.A, ids.B);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].sameTeam, true);
  await assert.rejects(() => mergePlayers(ids.A, ids.B), /same match/i);
});

test("merging a player with no matches just removes them", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("A"), await findOrCreatePlayer("B")];
  const ghost = await findOrCreatePlayer("Ghost");
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  const before = await getLeaderboard(game.id);

  const result = await mergePlayers(ghost.id, a.id);
  assert.equal(result.matchesMoved, 0);
  assert.equal(await findPlayerByName("Ghost"), null);
  assert.deepEqual(await getLeaderboard(game.id), before);
});

test("a merge spanning several games recomputes each of them", opts, async () => {
  const g1 = await pool();
  const g2 = await createGame({
    name: "Darts",
    minTeamSize: 1,
    maxTeamSize: 1,
    teamsPerMatch: 2,
    allowsDraws: false,
  });
  const [dup, keep, foe] = [
    await findOrCreatePlayer("Dup"),
    await findOrCreatePlayer("Keep"),
    await findOrCreatePlayer("Foe"),
  ];
  await createMatch({
    gameId: g1.id,
    teams: [
      { rank: 1, playerIds: [dup.id] },
      { rank: 2, playerIds: [foe.id] },
    ],
  });
  await createMatch({
    gameId: g2.id,
    teams: [
      { rank: 1, playerIds: [keep.id] },
      { rank: 2, playerIds: [foe.id] },
    ],
  });

  const result = await mergePlayers(dup.id, keep.id);
  assert.equal(result.gamesRecomputed, 2);
  assert.ok((await getLeaderboard(g1.id)).some((r) => r.name === "Keep"));
  assert.ok((await getLeaderboard(g2.id)).some((r) => r.name === "Keep"));
});

test("merging a player into itself is refused", opts, async () => {
  const a = await findOrCreatePlayer("A");
  await assert.rejects(() => mergePlayers(a.id, a.id), /into itself/i);
});

test("renaming a player keeps their matches and rating", opts, async () => {
  const game = await pool();
  const [a, b] = [await findOrCreatePlayer("Jakcson"), await findOrCreatePlayer("Sam")];
  await createMatch({
    gameId: game.id,
    teams: [
      { rank: 1, playerIds: [a.id] },
      { rank: 2, playerIds: [b.id] },
    ],
  });
  const before = (await getLeaderboard(game.id))[0].displayRating;

  await renamePlayer(a.id, "Jackson");
  const board = await getLeaderboard(game.id);
  assert.equal(board[0].name, "Jackson");
  assert.equal(board[0].displayRating, before);
});
