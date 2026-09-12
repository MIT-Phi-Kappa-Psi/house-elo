import { test } from "node:test";
import assert from "node:assert/strict";
import { splitStatements, schemaStatements } from "../lib/schema";

test("a statement preceded by a comment block is not discarded", () => {
  const sql = `
create table a (id int);

-- ---------------------------------------------------------------------------
-- A section header.
-- ---------------------------------------------------------------------------

create table b (id int);
`;
  const statements = splitStatements(sql);
  assert.equal(statements.length, 2);
  assert.ok(statements[1].startsWith("create table b"));
});

test("trailing comments and blank lines yield no empty statements", () => {
  const statements = splitStatements("create table a (id int);\n\n-- done\n");
  assert.equal(statements.length, 1);
});

test("the real schema creates every table the app reads", () => {
  const joined = schemaStatements().join("\n").toLowerCase();
  for (const table of [
    "games",
    "players",
    "matches",
    "match_teams",
    "match_players",
    "ratings",
    "rating_history",
  ]) {
    assert.ok(
      joined.includes(`create table if not exists ${table} `),
      `schema must create ${table}`,
    );
  }
});
