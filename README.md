# House Elo

Head-to-head skill ratings for any game, at any team size. Add a game, log who
won, get a ranking of every individual player.

- **Any format.** Team size is a property of the game: 1v1, 2v2, 3v3, 5v5,
  free-for-alls, and uneven sides when someone doesn't show.
- **Individual ratings from team results.** A 3v3 result updates all six
  players' personal ratings.
- **Ratings per game.** Being good at pool says nothing about darts, so each
  game keeps its own independent ladder.
- **Editable history.** Void, restore or back-date any match and every rating
  is recomputed from scratch.

## How the rating works

Not Elo, despite the name. Elo is a 1v1 algorithm with no notion of
uncertainty; every team extension of it is an ad-hoc hack, and a newcomer's
first result moves them as much as a veteran's two-hundredth.

This uses [OpenSkill](https://openskill.me) — the Weng-Lin Bayesian method, an
open reimplementation of the ideas behind TrueSkill (which is patented;
OpenSkill is MIT). Each player is a distribution rather than a number:

- **μ (mu)** — estimated skill.
- **σ (sigma)** — how unsure the system is.

The displayed number is the *conservative* estimate, `(μ − 3σ) × 40 + 1000`, so
everyone starts at 1000 and climbs as the system gains confidence. That's
deliberate: a player can't sit at an inflated rating on the strength of two
lucky games, and sandbagging doesn't pay.

Matches are stored as **placements**, not winner/loser. One shape covers every
case: 1v1 is two teams of one, a draw is two teams sharing rank 1, a six-player
free-for-all is six teams with ranks 1–6.

### Matches are the source of truth

`games`, `players`, `matches`, `match_teams` and `match_players` are the real
data. `ratings` and `rating_history` are a **projection** — drop them at any
time and `recomputeGame()` rebuilds them by replaying the match log in
chronological order.

That's what makes fixing a mis-entered match, back-dating one someone forgot to
log, or changing the rating algorithm outright safe after the fact. At house
league scale a full replay takes milliseconds. The "Recompute" button on each
game page does it on demand.

## Players

Players are global and created on the fly: type a name into a match and they
exist from then on. The **Players** page lists everyone, with how many matches
and games they've appeared in, and grows on its own.

Rosters are built from chips. Typing narrows a dropdown of existing players;
picking one adds a chip. A name matching nobody can still be added — it appears
as a chip marked **new** and the player is created on submit — but that is a
separate, deliberate row in the dropdown rather than something a typo does
silently.

When the same person does end up under two names, **Merge duplicates** on the
Players page folds one into the other: every match is reassigned, the duplicate
is deleted, and each affected game is replayed from its log. The result is
identical to having used one name all along.

A merge is refused when both players appear in the same match — that would put
one person on both sides of a result, or silently shrink a team. The error names
the conflicting matches so you can void or fix them first.

## Naked laps

Each team on a match can be marked as owing a naked lap. It shows as a badge on
the match wherever that match appears, and the Players page is ranked by laps
owed — most first. Voiding a match withdraws its laps; merging two players sums
theirs.

## Tickets

The floating **?** button on every page opens a short bug/request form. Anyone
who can reach the site can file one.

There is deliberately no page for reading them back — filing is open, the queue
is not, so one person's report is not everyone's reading material. Tickets live
in the database and are read and triaged from a terminal:

```bash
npm run tickets                   # all, untriaged first
npm run tickets -- open           # only that status
npm run tickets -- --json         # machine-readable
npm run tickets -- planned <id>   # triage: open | planned | done | declined
npm run tickets -- rm <id>        # delete one
```

This is also the point of the CLI: it hands the whole backlog to a coding agent
without screenshots.

## Storage

The database is on Neon's free tier: **512 MB**, shared by data and history
retention. Check where you stand at any time:

```bash
npm run db:size
```

A match costs roughly 5–7 KB across all tables, so the budget is on the order of
**75,000–95,000 matches**. At twenty matches a day that is over a decade.

The thing that actually threatened this was not row count but write
amplification. Ratings are derived from the match log, and the first
implementation rebuilt a game's entire projection on every single insert:
O(matches²) row writes over a game's life, leaving the derived tables ~86% dead
tuples. Appending a match now writes only the rows for the players in it, and
the full replay runs only when it has to — a back-dated match, a void, a merge,
or the Recompute button. If `npm run db:size` ever reports a large dead-row
count, something has regressed to rewriting more than it needs to.

## What it deliberately doesn't do

- **Tell who carried.** In team games the update is distributed by uncertainty,
  not contribution — no rating system can infer this from the result alone. If
  two people always play on the same side, the rating describes the pair. The
  player page warns when that happens; shuffling teams fixes it.
- **Use margin of victory.** Scores are stored but don't affect ratings.
  Bolting MOV onto OpenSkill is a footgun; add it deliberately or not at all.
- **Decay inactive players.** Ratings stay put. If you want stale ratings to
  become uncertain again, inflate σ over time in `replay()`.

## Deploy

One account (Vercel), one database, free tier.

1. **Push this repo to GitHub**, then import it at
   [vercel.com/new](https://vercel.com/new).

2. **Create the database from inside Vercel** — project → **Storage** →
   **Create Database** → **Neon**. Provisioning it here links it to the project
   and injects `DATABASE_URL` automatically; there's no separate signup.

3. **Apply the schema** once, from your machine, against that database:

   ```bash
   vercel env pull .env.local && npm run migrate
   ```

   Or paste the connection string (Neon → Connect) into `.env.local` by hand
   and run `npm run migrate`.

4. **Redeploy** so the app picks up `DATABASE_URL`.

Optional: set `HOUSE_PASSWORD` in Vercel's environment variables to put the
whole site behind a single shared password. Leave it unset and the site is
open. It intentionally isn't a real auth provider — that would mean another
account and another bill.

## Mobile

The layout is built for a phone first: tables drop their lower-value columns
below `sm` and scroll horizontally inside their own box rather than pushing the
page sideways, and the ? form opens as a full-width sheet. Verified at 375×812.

## Local development

Any Postgres works; the driver is chosen from the connection string (Neon's
HTTP driver for `*.neon.tech`, node-postgres otherwise).

```bash
npm install
cp .env.example .env.local   # point DATABASE_URL at any Postgres
npm run migrate
npm run seed                 # optional sample data
npm run dev
```

**If you pulled env from Vercel**, `.env.local` points at the *production*
database — `npm run dev` would then read and write live data, and `npm run seed`
would dump 80 fake matches into the real ladder. Put a local URL in
`.env.development.local`, which Next loads ahead of `.env.local` in development
and which is already gitignored:

```bash
echo 'DATABASE_URL="postgresql://localhost/house_elo_dev"' > .env.development.local
```

## Tests

```bash
npm test
```

Rating-engine and schema tests run with no database. The integration tests
covering the query layer need one:

```bash
createdb house_elo_test
TEST_DATABASE_URL=postgresql://localhost/house_elo_test npm test
```

They truncate every table between tests — point them at a throwaway database.

## Layout

| Path | What lives there |
| --- | --- |
| `lib/rating.ts` | The rating engine. Pure, no I/O, replays a match log. |
| `lib/queries.ts` | All SQL, plus `recomputeGame()`. |
| `lib/schema.sql` | Tables. Source-of-truth and derived, marked as such. |
| `lib/db.ts` | Driver selection (Neon HTTP / node-postgres). |
| `app/actions.ts` | Server actions and all input validation. |
| `lib/chips.ts` | Selection rules for the player chip picker. |
| `app/players/` | Player directory, rename, and merge. |
| `app/components/help-widget.tsx` | The floating ? and its filing form. |
| `scripts/tickets.mts` | Read and triage the ticket queue from a terminal. |
| `scripts/db-size.mts` | Storage use against the free-tier budget. |
| `test/` | Engine tests, schema tests, DB integration tests. |

## Things you may want to change

- **`PROVISIONAL_MATCHES`** in `lib/queries.ts` — how many games before a player
  joins the main leaderboard (default 5).
- **`DISPLAY_SCALE` / `DISPLAY_BASE`** in `lib/rating.ts` — the affine transform
  on the displayed number. Only cosmetic; μ and σ are what's stored.
- **One ladder or two for multi-format games.** OpenSkill handles mixed team
  sizes in a single pool, so pool 1v1 and 2v2 can share a rating. If a game's
  formats are really different skills (volleyball 2v2 vs 6v6), create them as
  two games.
