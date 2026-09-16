import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SORT,
  METRICS,
  isRanked,
  metricFor,
  rankPlayers,
} from "../lib/player-ranking";
import type { PlayerDirectoryRow } from "../lib/queries";

function player(
  name: string,
  fields: Partial<PlayerDirectoryRow> = {},
): PlayerDirectoryRow {
  return {
    id: name.toLowerCase(),
    slug: name.toLowerCase(),
    name,
    matchesPlayed: 0,
    gamesPlayed: 0,
    nakedLaps: 0,
    lastPlayed: null,
    overallRating: null,
    overallSigma: null,
    overallProvisional: false,
    ...fields,
  };
}

const ROSTER = [
  player("Alex", {
    overallRating: 1180,
    matchesPlayed: 20,
    gamesPlayed: 2,
    nakedLaps: 1,
  }),
  player("Jordan", {
    overallRating: 1240,
    matchesPlayed: 12,
    gamesPlayed: 4,
    nakedLaps: 0,
  }),
  player("Sam", {
    overallRating: 970,
    matchesPlayed: 30,
    gamesPlayed: 1,
    nakedLaps: 5,
  }),
  player("Kim"),
];

const order = (key: Parameters<typeof rankPlayers>[1]) =>
  rankPlayers(ROSTER, key).map((p) => p.name);

test("the board leads with overall Elo", () => {
  assert.equal(DEFAULT_SORT, "overall");
  assert.deepEqual(order("overall"), ["Jordan", "Alex", "Sam", "Kim"]);
});

test("each metric orders the same roster its own way", () => {
  assert.deepEqual(order("laps"), ["Sam", "Alex", "Jordan", "Kim"]);
  assert.deepEqual(order("matches"), ["Sam", "Alex", "Jordan", "Kim"]);
  assert.deepEqual(order("games"), ["Jordan", "Alex", "Sam", "Kim"]);
});

test("a player with nothing to show sorts last on every metric", () => {
  for (const metric of METRICS) {
    assert.equal(
      rankPlayers(ROSTER, metric.key).at(-1)!.name,
      "Kim",
      `${metric.key} should leave an empty record at the bottom`,
    );
  }
});

test("sorting leaves the caller's array alone", () => {
  const before = ROSTER.map((p) => p.name);
  rankPlayers(ROSTER, "laps");
  assert.deepEqual(
    ROSTER.map((p) => p.name),
    before,
  );
});

test("ties break on matches played, then name", () => {
  const tied = [
    player("Zoe", { nakedLaps: 2, matchesPlayed: 4 }),
    player("Abe", { nakedLaps: 2, matchesPlayed: 9 }),
    player("Bea", { nakedLaps: 2, matchesPlayed: 4 }),
  ];
  assert.deepEqual(
    rankPlayers(tied, "laps").map((p) => p.name),
    ["Abe", "Bea", "Zoe"],
  );
});

test("a zero is shown but is not a placing", () => {
  const laps = metricFor("laps");
  assert.equal(laps.value(player("Kim")), 0);
  assert.equal(isRanked(laps, player("Kim")), false);
  assert.equal(isRanked(laps, player("Sam", { nakedLaps: 1 })), true);
});

test("an unrated player has no overall number and no placing", () => {
  const overall = metricFor("overall");
  assert.equal(overall.value(player("Kim")), null);
  assert.equal(isRanked(overall, player("Kim")), false);
});

test("an unknown sort key falls back to the default rather than throwing", () => {
  assert.equal(metricFor("nonsense" as never).key, DEFAULT_SORT);
});
