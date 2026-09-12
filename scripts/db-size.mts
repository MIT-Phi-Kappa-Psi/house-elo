/**
 * Report storage use against the Neon free tier's 0.5 GB budget.
 *
 *   npm run db:size
 */
import "./env.mts";
import { closeDriver, sql } from "../lib/db.js";

const LIMIT_BYTES = 0.5 * 1024 ** 3;

const tables = await sql().raw(`
  select c.relname as name,
         pg_total_relation_size(c.oid) as bytes,
         coalesce(s.n_live_tup, 0) as rows,
         coalesce(s.n_dead_tup, 0) as dead
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public' and c.relkind = 'r'
  order by bytes desc
`);

const [{ matches }] = await sql().raw(
  "select count(*)::int as matches from matches where not voided",
);

const total = tables.reduce((n, t) => n + Number(t.bytes), 0);
const mb = (b: number) => `${(b / 1024 ** 2).toFixed(1)} MB`;

console.log("table              size        rows     dead");
for (const t of tables) {
  console.log(
    `${String(t.name).padEnd(18)} ${mb(Number(t.bytes)).padStart(9)} ${String(t.rows).padStart(8)} ${String(t.dead).padStart(8)}`,
  );
}

const pct = ((total / LIMIT_BYTES) * 100).toFixed(2);
console.log(`\n${mb(total)} of 512.0 MB used (${pct}%)`);

if (Number(matches) > 0) {
  const perMatch = total / Number(matches);
  const headroom = Math.floor((LIMIT_BYTES - total) / perMatch);
  console.log(
    `${matches} matches · ~${(perMatch / 1024).toFixed(1)} KB each · ` +
      `room for roughly ${headroom.toLocaleString()} more`,
  );
}

const dead = tables.reduce((n, t) => n + Number(t.dead), 0);
if (dead > 10_000) {
  console.log(
    `\n${dead.toLocaleString()} dead rows awaiting autovacuum. If this stays high, ` +
      "something is rewriting rows more than it needs to.",
  );
}

await closeDriver();
