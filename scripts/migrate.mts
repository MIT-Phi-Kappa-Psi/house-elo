/**
 * Applies lib/schema.sql. Idempotent — every statement is `if not exists`, so
 * running it against an existing database is a no-op.
 */
import "./env.mts";
import { sql, closeDriver } from "../lib/db.js";
import { schemaStatements } from "../lib/schema.js";

const statements = schemaStatements();

for (const statement of statements) {
  await sql().raw(statement);
}

await closeDriver();
console.log(`Applied ${statements.length} statements.`);
