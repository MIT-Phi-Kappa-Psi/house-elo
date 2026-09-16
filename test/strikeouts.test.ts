/** Strikeout tallies and the 6am-6am day boundary. */
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { closeDriver, sql } from "../lib/db";
import { schemaStatements } from "../lib/schema";
import { houseDayOf, formatHouseDay, fromHouseLocal } from "../lib/house-day";
import {
  createStrikeouts,
  deleteStrikeout,
  findOrCreatePlayer,
  getStrikeoutStandings,
  listStrikeouts,
} from "../lib/queries";

const url = process.env.TEST_DATABASE_URL;
const opts = { skip: url ? false : "set TEST_DATABASE_URL to run" };
if (url) process.env.DATABASE_URL = url;

before(async () => {
  if (!url) return;
  for (const statement of schemaStatements()) await sql().raw(statement);
});

beforeEach(async () => {
  if (!url) return;
  await sql()`truncate strikeouts, players restart identity cascade`;
});

after(async () => {
  if (!url) return;
  await closeDriver();
});

/** A UTC instant for the given Eastern wall-clock time (EDT, UTC-4). */
const et = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 6, day, hour + 4, minute));

test("2am belongs to the night before, 6am starts a new day", () => {
  assert.equal(houseDayOf(et(10, 2)), "2026-07-09", "2am is still the 9th");
  assert.equal(houseDayOf(et(10, 5, 59)), "2026-07-09", "5:59am is still the 9th");
  assert.equal(houseDayOf(et(10, 6)), "2026-07-10", "6am opens the 10th");
  assert.equal(houseDayOf(et(10, 23)), "2026-07-10", "11pm is the 10th");
});

test("a night spanning midnight is one house day", opts, async () => {
  const p = await findOrCreatePlayer("Nighthawk");
  // 10pm Friday and 1am Saturday are the same night.
  await createStrikeouts({ playerIds: [p.id], amount: 3, occurredAt: et(10, 22) });
  await createStrikeouts({ playerIds: [p.id], amount: 4, occurredAt: et(11, 1) });

  const [s] = await getStrikeoutStandings();
  assert.equal(s.total, 7);
  assert.equal(s.bestDay, 7, "both sessions count as one day");
  assert.equal(s.bestDayOn, "2026-07-10");
});

test("crossing 6am splits into two house days", opts, async () => {
  const p = await findOrCreatePlayer("Earlybird");
  await createStrikeouts({ playerIds: [p.id], amount: 5, occurredAt: et(10, 5) });
  await createStrikeouts({ playerIds: [p.id], amount: 4, occurredAt: et(10, 7) });

  const [s] = await getStrikeoutStandings();
  assert.equal(s.total, 9);
  assert.equal(s.bestDay, 5, "5am and 7am are different days, so neither sums");
  assert.equal(s.bestDayOn, "2026-07-09");
});

test("the single-day record is the best day, not the latest", opts, async () => {
  const p = await findOrCreatePlayer("Streaky");
  await createStrikeouts({ playerIds: [p.id], amount: 9, occurredAt: et(10, 20) });
  await createStrikeouts({ playerIds: [p.id], amount: 2, occurredAt: et(20, 20) });

  const [s] = await getStrikeoutStandings();
  assert.equal(s.bestDay, 9);
  assert.equal(s.bestDayOn, "2026-07-10");
  assert.equal(s.total, 11);
});

test("the two rankings can disagree", opts, async () => {
  const spike = await findOrCreatePlayer("Spike");
  const grind = await findOrCreatePlayer("Grind");

  // One huge night versus many small ones.
  await createStrikeouts({ playerIds: [spike.id], amount: 12, occurredAt: et(10, 21) });
  for (const d of [11, 12, 13, 14, 15]) {
    await createStrikeouts({ playerIds: [grind.id], amount: 4, occurredAt: et(d, 21) });
  }

  const standings = await getStrikeoutStandings();
  const byDay = [...standings].sort((a, b) => b.bestDay - a.bestDay);
  const byTotal = [...standings].sort((a, b) => b.total - a.total);

  assert.equal(byDay[0].name, "Spike", "Spike holds the single-day record");
  assert.equal(byDay[0].bestDay, 12);
  assert.equal(byTotal[0].name, "Grind", "Grind leads all time");
  assert.equal(byTotal[0].total, 20);
});

test("one logging event covers several players", opts, async () => {
  const ids = [];
  for (const n of ["A", "B", "C"]) ids.push((await findOrCreatePlayer(n)).id);
  const written = await createStrikeouts({
    playerIds: ids,
    amount: 2,
    occurredAt: et(10, 21),
    note: "Snappa night",
  });

  assert.equal(written, 3);
  const standings = await getStrikeoutStandings();
  assert.equal(standings.length, 3);
  for (const s of standings) {
    assert.equal(s.total, 2);
    assert.equal(s.bestDay, 2);
  }
  assert.equal((await listStrikeouts())[0].note, "Snappa night");
});

test("players with none are listed but not ranked", opts, async () => {
  const played = await findOrCreatePlayer("Played");
  await findOrCreatePlayer("Abstained");
  await createStrikeouts({ playerIds: [played.id], amount: 1, occurredAt: et(10, 21) });

  const standings = await getStrikeoutStandings();
  assert.equal(standings.length, 2, "the shared player list is complete");
  const idle = standings.find((s) => s.name === "Abstained")!;
  assert.equal(idle.total, 0);
  assert.equal(idle.bestDay, 0);
  assert.equal(idle.bestDayOn, null);
});

test("deleting an entry withdraws it from both rankings", opts, async () => {
  const p = await findOrCreatePlayer("Oops");
  await createStrikeouts({ playerIds: [p.id], amount: 3, occurredAt: et(10, 21) });
  await createStrikeouts({ playerIds: [p.id], amount: 8, occurredAt: et(12, 21) });
  assert.equal((await getStrikeoutStandings())[0].bestDay, 8);

  const wrong = (await listStrikeouts()).find((e) => e.amount === 8)!;
  await deleteStrikeout(wrong.id);

  const [s] = await getStrikeoutStandings();
  assert.equal(s.total, 3);
  assert.equal(s.bestDay, 3);
});

test("strikeouts attach to the same players as matches", opts, async () => {
  const first = await findOrCreatePlayer("Jackson");
  // Matching is case-insensitive, so this must not create a second person.
  const again = await findOrCreatePlayer("jackson");
  assert.equal(first.id, again.id);

  await createStrikeouts({ playerIds: [first.id], amount: 1, occurredAt: et(10, 21) });
  const standings = await getStrikeoutStandings();
  assert.equal(standings.length, 1);
  assert.equal(standings[0].name, "Jackson");
});

test("a house day renders as a readable date", () => {
  assert.match(formatHouseDay("2026-07-10"), /Jul 10, 2026/);
});

test("a datetime-local value is read as house time, not server time", () => {
  // 8am Eastern is 12:00 UTC in September; read as server-local UTC it would
  // be 04:00 ET and fall on the previous house day.
  const at = fromHouseLocal("2026-09-15T08:00");
  assert.equal(at.toISOString(), "2026-09-15T12:00:00.000Z");
  assert.equal(houseDayOf(at), "2026-09-15");

  // Naively parsed, the same string lands on the wrong night.
  assert.equal(houseDayOf(new Date("2026-09-15T08:00Z")), "2026-09-14");
});

test("house time survives the 6am boundary in both directions", () => {
  assert.equal(houseDayOf(fromHouseLocal("2026-09-15T05:59")), "2026-09-14");
  assert.equal(houseDayOf(fromHouseLocal("2026-09-15T06:00")), "2026-09-15");
  assert.equal(houseDayOf(fromHouseLocal("2026-09-15T23:30")), "2026-09-15");
  assert.equal(houseDayOf(fromHouseLocal("2026-09-16T01:15")), "2026-09-15");
});

test("winter and summer offsets are both handled", () => {
  // EST (UTC-5) in January, EDT (UTC-4) in July.
  assert.equal(fromHouseLocal("2026-01-15T08:00").toISOString(), "2026-01-15T13:00:00.000Z");
  assert.equal(fromHouseLocal("2026-07-15T08:00").toISOString(), "2026-07-15T12:00:00.000Z");
});
