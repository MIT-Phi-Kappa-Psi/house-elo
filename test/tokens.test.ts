import { test } from "node:test";
import assert from "node:assert/strict";
import { activeToken, replaceActiveToken, suggestionsFor } from "../lib/tokens";

const KNOWN = ["Jackson", "Sam", "Sammy", "Alex", "Kim", "Jordan"];

test("the active token is the one under the caret, not the whole field", () => {
  const value = "Sam, Ki";
  assert.equal(activeToken(value, value.length).text, "Ki");
  assert.equal(activeToken(value, 2).text, "Sam");
});

test("caret at a boundary resolves to the token it sits against", () => {
  assert.equal(activeToken("Sam, Kim", 0).text, "Sam");
  assert.equal(activeToken("Sam, Kim", 8).text, "Kim");
});

test("suggestions keep working past the first name", () => {
  const value = "Sam, Ki";
  assert.deepEqual(suggestionsFor(value, value.length, KNOWN), ["Kim"]);
});

test("prefix matches rank above substring matches", () => {
  assert.deepEqual(suggestionsFor("am", 2, KNOWN), ["Sam", "Sammy"]);
});

test("names already in the field are not suggested again", () => {
  const value = "Sam, Sam";
  assert.equal(suggestionsFor(value, value.length, KNOWN).includes("Sam"), false);
});

test("editing an earlier token still suggests that token's own name", () => {
  const value = "Sam, Kim";
  // Caret inside "Sam" — Sam must remain a candidate for the slot it occupies.
  assert.ok(suggestionsFor(value, 3, KNOWN).includes("Sam"));
  assert.equal(suggestionsFor(value, 3, KNOWN).includes("Kim"), false);
});

test("an empty token offers everyone not already picked", () => {
  assert.deepEqual(suggestionsFor("Sam, ", 5, KNOWN), [
    "Jackson",
    "Sammy",
    "Alex",
    "Kim",
    "Jordan",
  ]);
});

test("accepting a suggestion replaces only the active token", () => {
  const value = "Sam, Ki";
  const next = replaceActiveToken(value, value.length, "Kim");
  assert.equal(next.value, "Sam, Kim, ");
  assert.equal(next.caret, next.value.length);
});

test("accepting into the first slot leaves later names intact", () => {
  const next = replaceActiveToken("Ja, Kim", 2, "Jackson");
  assert.equal(next.value, "Jackson, Kim");
  assert.equal(next.caret, "Jackson".length);
});

test("accepting into an empty field needs no leading space", () => {
  assert.equal(replaceActiveToken("", 0, "Sam").value, "Sam, ");
});
