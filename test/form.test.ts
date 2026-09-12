import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNames } from "../lib/format";

test("player names are split on commas and trimmed", () => {
  assert.deepEqual(parseNames("Jackson, Sam"), ["Jackson", "Sam"]);
  assert.deepEqual(parseNames("  Jackson ,  Sam  "), ["Jackson", "Sam"]);
});

test("empty entries and trailing commas are dropped", () => {
  assert.deepEqual(parseNames("Jackson,,Sam,"), ["Jackson", "Sam"]);
  assert.deepEqual(parseNames("   "), []);
  assert.deepEqual(parseNames(""), []);
});
