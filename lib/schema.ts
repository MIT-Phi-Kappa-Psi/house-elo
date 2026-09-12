import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Split schema.sql into executable statements.
 *
 * Comment lines are stripped *before* splitting: a naive split on `;` leaves
 * each statement prefixed by the comment block above it, and filtering those
 * chunks out silently discards the statement attached to them. The schema
 * contains no string literals with `--` in them, which is what makes stripping
 * by line safe here.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export function schemaStatements(): string[] {
  const path = join(process.cwd(), "lib", "schema.sql");
  return splitStatements(readFileSync(path, "utf8"));
}
