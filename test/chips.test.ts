import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addChip,
  canAdd,
  canonicalName,
  filterSuggestions,
  normalizeName,
  shouldOfferNew,
} from "../lib/chips";

const KNOWN = ["Jackson", "Sam", "Sammy", "Alex", "Kim", "Jordan"];

test("names are trimmed and stripped of commas", () => {
  assert.equal(normalizeName("  Sam  "), "Sam");
  assert.equal(normalizeName("Van, Halen"), "Van Halen");
  assert.equal(normalizeName("a   b"), "a b");
});

test("typing an existing name in any case snaps to its real spelling", () => {
  assert.equal(canonicalName("jackson", KNOWN), "Jackson");
  assert.equal(canonicalName("  JACKSON ", KNOWN), "Jackson");
  assert.equal(canonicalName("Jakcson", KNOWN), null);
});

test("adding uses the canonical spelling, never a second casing", () => {
  assert.deepEqual(addChip("jackson", [], KNOWN), ["Jackson"]);
  assert.deepEqual(addChip("Jakcson", [], KNOWN), ["Jakcson"]);
});

test("the same player cannot be added to a team twice", () => {
  assert.equal(canAdd("Sam", ["Sam"]), false);
  assert.equal(canAdd("sam", ["Sam"]), false);
  assert.deepEqual(addChip("sam", ["Sam"], KNOWN), ["Sam"]);
});

test("empty or whitespace names are rejected", () => {
  assert.equal(canAdd("", []), false);
  assert.equal(canAdd("   ", []), false);
  assert.deepEqual(addChip("  ", [], KNOWN), []);
});

test("typing narrows the list, prefix matches first", () => {
  assert.deepEqual(filterSuggestions("am", KNOWN, []), ["Sam", "Sammy"]);
  assert.deepEqual(filterSuggestions("ja", KNOWN, []), ["Jackson"]);
  // "Jordan" and "Jackson" both start with "j"; both survive a looser query.
  assert.deepEqual(filterSuggestions("j", KNOWN, []), ["Jackson", "Jordan"]);
});

test("already-chosen players drop out of the list", () => {
  assert.deepEqual(filterSuggestions("sam", KNOWN, ["Sam"]), ["Sammy"]);
});

test("an empty query offers everyone still available", () => {
  assert.deepEqual(filterSuggestions("", KNOWN, ["Sam", "Alex"]), [
    "Jackson",
    "Sammy",
    "Kim",
    "Jordan",
  ]);
});

test("a non-unique query keeps every candidate so one can be picked", () => {
  // "Sam" matches both Sam and Sammy; neither is chosen for the user.
  assert.deepEqual(filterSuggestions("Sam", KNOWN, []), ["Sam", "Sammy"]);
});

test("creating is offered only for genuinely new names", () => {
  assert.equal(shouldOfferNew("Jakcson", KNOWN, []), true);
  assert.equal(shouldOfferNew("Jackson", KNOWN, []), false);
  assert.equal(shouldOfferNew("jackson", KNOWN, []), false, "case must not create a duplicate");
  assert.equal(shouldOfferNew("", KNOWN, []), false);
  assert.equal(shouldOfferNew("Sam", KNOWN, ["Sam"]), false);
});

test("a new name is still offered when it is a prefix of an existing one", () => {
  // "Sammi" is nobody yet, even though "Sammy" is close.
  assert.equal(shouldOfferNew("Sammi", KNOWN, []), true);
  assert.deepEqual(filterSuggestions("Sammi", KNOWN, []), []);
});
