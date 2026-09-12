import { test } from "node:test";
import assert from "node:assert/strict";
import {
  replay,
  displayRating,
  newRating,
  compareMatches,
  isRatable,
  winProbability,
  DISPLAY_BASE,
  type MatchInput,
} from "../lib/rating";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

function match(id: string, n: number, teams: [string[], number][]): MatchInput {
  return {
    id,
    playedAt: day(n),
    teams: teams.map(([playerIds, rank]) => ({ playerIds, rank })),
  };
}

test("an unrated player sits exactly at the display base", () => {
  assert.equal(displayRating(newRating()), DISPLAY_BASE);
});

test("winning raises the display rating and losing lowers it", () => {
  const { states } = replay([match("m1", 1, [[["a"], 1], [["b"], 2]])]);
  assert.ok(displayRating(states.get("a")!) > DISPLAY_BASE);
  assert.ok(displayRating(states.get("b")!) < DISPLAY_BASE);
});

test("a win and a loss are recorded per player", () => {
  const { states } = replay([match("m1", 1, [[["a"], 1], [["b"], 2]])]);
  assert.equal(states.get("a")!.wins, 1);
  assert.equal(states.get("a")!.losses, 0);
  assert.equal(states.get("b")!.losses, 1);
  assert.equal(states.get("a")!.matchesPlayed, 1);
});

test("equal ranks are a draw: mu is unchanged but sigma tightens", () => {
  const { states } = replay([match("m1", 1, [[["a"], 1], [["b"], 1]])]);
  const a = states.get("a")!;
  assert.equal(a.mu, 25);
  assert.ok(a.sigma < newRating().sigma);
  assert.equal(a.draws, 1);
  assert.equal(a.wins, 0);
});

test("2v2 and 3v3 move every member of the winning team up", () => {
  const { states } = replay([
    match("m1", 1, [[["a", "b", "c"], 1], [["d", "e", "f"], 2]]),
  ]);
  for (const id of ["a", "b", "c"]) {
    assert.ok(displayRating(states.get(id)!) > DISPLAY_BASE, `${id} should rise`);
  }
  for (const id of ["d", "e", "f"]) {
    assert.ok(displayRating(states.get(id)!) < DISPLAY_BASE, `${id} should fall`);
  }
});

test("unequal team sizes are supported", () => {
  const { states } = replay([match("m1", 1, [[["a", "b"], 2], [["solo"], 1]])]);
  // One player beating two should be rewarded more than a like-for-like win.
  const solo = displayRating(states.get("solo")!);
  const { states: even } = replay([match("m2", 1, [[["x"], 1], [["y"], 2]])]);
  assert.ok(solo > displayRating(even.get("x")!));
});

test("free-for-all with N teams orders players by placement", () => {
  const { states } = replay([
    match("m1", 1, [[["a"], 1], [["b"], 2], [["c"], 3], [["d"], 4]]),
  ]);
  const r = (id: string) => states.get(id)!.mu;
  assert.ok(r("a") > r("b") && r("b") > r("c") && r("c") > r("d"));
});

test("a consistent winner ends up top of the ladder", () => {
  const matches: MatchInput[] = [];
  for (let i = 0; i < 20; i++) {
    matches.push(match(`m${i}`, i + 1, [[["strong"], 1], [[`weak${i % 4}`], 2]]));
  }
  const { states } = replay(matches);
  const ranked = [...states.values()].sort(
    (x, y) => displayRating(y) - displayRating(x),
  );
  assert.equal(ranked[0].playerId, "strong");
});

test("uncertainty shrinks with games played, so ratings stop swinging", () => {
  const matches: MatchInput[] = [];
  for (let i = 0; i < 30; i++) {
    matches.push(match(`m${i}`, i + 1, [[["a"], i % 2 === 0 ? 1 : 2], [["b"], i % 2 === 0 ? 2 : 1]]));
  }
  const { states } = replay(matches);
  assert.ok(states.get("a")!.sigma < newRating().sigma / 2);
});

test("replay is deterministic and order-independent of the input array", () => {
  const matches = [
    match("m1", 1, [[["a"], 1], [["b"], 2]]),
    match("m2", 2, [[["b"], 1], [["c"], 2]]),
    match("m3", 3, [[["c"], 1], [["a"], 2]]),
  ];
  const forward = replay(matches);
  const shuffled = replay([matches[2], matches[0], matches[1]]);
  for (const id of ["a", "b", "c"]) {
    assert.equal(forward.states.get(id)!.mu, shuffled.states.get(id)!.mu);
    assert.equal(forward.states.get(id)!.sigma, shuffled.states.get(id)!.sigma);
  }
});

test("chronology matters: the same results in a different order differ", () => {
  const early = replay([
    match("m1", 1, [[["a"], 1], [["b"], 2]]),
    match("m2", 2, [[["a"], 1], [["c"], 2]]),
  ]);
  const late = replay([
    match("m1", 1, [[["a"], 1], [["c"], 2]]),
    match("m2", 2, [[["c"], 1], [["b"], 2]]),
  ]);
  assert.notEqual(early.states.get("b")!.mu, late.states.get("b")!.mu);
});

test("removing a match rewinds its effect completely", () => {
  const all = [
    match("m1", 1, [[["a"], 1], [["b"], 2]]),
    match("m2", 2, [[["a"], 1], [["b"], 2]]),
  ];
  const withoutSecond = replay(all.slice(0, 1));
  const recomputed = replay(all.filter((m) => m.id !== "m2"));
  assert.deepEqual(
    [...recomputed.states.values()].map((s) => [s.playerId, s.mu, s.sigma]),
    [...withoutSecond.states.values()].map((s) => [s.playerId, s.mu, s.sigma]),
  );
});

test("history records one row per player per match with a delta", () => {
  const { history } = replay([
    match("m1", 1, [[["a", "b"], 1], [["c", "d"], 2]]),
  ]);
  assert.equal(history.length, 4);
  assert.equal(history.filter((h) => h.outcome === "win").length, 2);
  assert.equal(history.filter((h) => h.outcome === "loss").length, 2);
  assert.ok(history.find((h) => h.playerId === "a")!.delta > 0);
  assert.ok(history.find((h) => h.playerId === "c")!.delta < 0);
});

test("a three-way draw is rating information, not a skipped row", () => {
  const { states } = replay([
    match("m1", 1, [[["a"], 1], [["b"], 1], [["c"], 1]]),
  ]);
  assert.equal(states.size, 3);
  for (const id of ["a", "b", "c"]) {
    assert.equal(states.get(id)!.draws, 1);
    assert.ok(states.get(id)!.sigma < newRating().sigma);
  }
});

test("unratable matches are skipped, not thrown on", () => {
  const bad = [
    match("m1", 1, [[["a"], 1]]),
    match("m2", 2, [[[], 1], [["b"], 2]]),
    match("m3", 3, []),
  ];
  for (const m of bad) assert.equal(isRatable(m), false);
  const { states, history } = replay(bad);
  assert.equal(states.size, 0);
  assert.equal(history.length, 0);
});

test("matches sort by time then id so the order is total", () => {
  const a = match("bbb", 1, [[["a"], 1], [["b"], 2]]);
  const b = match("aaa", 1, [[["a"], 1], [["b"], 2]]);
  assert.ok(compareMatches(a, b) > 0);
  assert.ok(compareMatches(b, a) < 0);
  assert.equal(compareMatches(a, a), 0);
});

test("win probability is even between identical teams and skewed otherwise", () => {
  assert.equal(winProbability([newRating()], [newRating()]), 0.5);
  const strong = { mu: 35, sigma: 2 };
  assert.ok(winProbability([strong], [newRating()]) > 0.8);
});
