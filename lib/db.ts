import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

/**
 * Two drivers behind one interface, chosen by connection string:
 *
 *  - Neon (`*.neon.tech`) uses their HTTP driver: one round trip per query and
 *    no pool to keep warm, which is what suits Vercel's serverless functions.
 *  - Anything else uses node-postgres, so the app runs against a plain local
 *    Postgres in development and stays portable to any host later.
 *
 * Both expose a tagged template returning rows plus `transaction([...])`.
 */
export type Row = Record<string, unknown>;

export type Query = PromiseLike<Row[]> & { __sql: { text: string; values: unknown[] } };

export type Driver = ((
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Query) & {
  transaction: (queries: readonly Query[]) => Promise<Row[][]>;
  /** Releases pooled connections. Only the pg driver holds any. */
  end?: () => Promise<void>;
};

function connectionString(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a Neon database from the Vercel dashboard " +
        "(Storage -> Create Database), then copy the connection string into .env.local.",
    );
  }
  return url;
}

function isNeon(url: string): boolean {
  return /neon\.(tech|build)/.test(url);
}

/** Interpolate a tagged template into a parameterised statement. */
function toStatement(strings: TemplateStringsArray, values: unknown[]) {
  const text = strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
    "",
  );
  return { text, values };
}

function neonDriver(url: string): Driver {
  const sql = neon(url);
  const run = sql as unknown as (
    s: TemplateStringsArray,
    ...v: unknown[]
  ) => Promise<Row[]>;

  const driver = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = run(strings, ...values) as unknown as Query;
    // The Neon driver's query objects are already lazily-executed thenables
    // that `sql.transaction()` accepts; carry the statement for parity.
    query.__sql = toStatement(strings, values);
    return query;
  }) as Driver;

  driver.transaction = (queries) =>
    sql.transaction(queries as never) as unknown as Promise<Row[][]>;

  return driver;
}

function pgDriver(url: string): Driver {
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });

  const driver = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = toStatement(strings, values);
    // Deferred: `transaction()` is handed these un-executed, matching Neon.
    const query: Query = {
      __sql: statement,
      then(resolve, reject) {
        return pool
          .query(statement.text, statement.values)
          .then((result) => result.rows as Row[])
          .then(resolve, reject);
      },
    };
    return query;
  }) as Driver;

  driver.transaction = async (queries) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const out: Row[][] = [];
      for (const query of queries) {
        const result = await client.query(query.__sql.text, query.__sql.values);
        out.push(result.rows as Row[]);
      }
      await client.query("commit");
      return out;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };

  driver.end = () => pool.end();
  return driver;
}

let cached: Driver | null = null;

/** Lazy so that importing this module never throws at build time. */
export function sql(): Driver {
  if (!cached) {
    const url = connectionString();
    cached = isNeon(url) ? neonDriver(url) : pgDriver(url);
  }
  return cached;
}

/** Point the query layer at a specific driver, or drop the cached one. */
export function setDriver(driver: Driver | null): void {
  cached = driver;
}

/** Closes any pooled connections. Used by tests and scripts, not by requests. */
export async function closeDriver(): Promise<void> {
  await cached?.end?.();
  cached = null;
}

export async function q(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Row[]> {
  return sql()(strings, ...values);
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "item";
}
