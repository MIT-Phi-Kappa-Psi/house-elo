import Link from "next/link";
import { listGames } from "@/lib/queries";
import { formatFormat } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const games = await listGames();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Games</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Each game keeps its own independent ratings.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {games.map((game) => (
          <li key={game.id}>
            <Link
              href={`/games/${game.slug}`}
              className="panel block px-5 py-4 transition hover:border-[var(--color-accent)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{game.name}</span>
                <span className="font-mono text-xs text-[var(--color-muted)]">
                  {formatFormat(game)}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                {game.matchCount} {game.matchCount === 1 ? "match" : "matches"} ·{" "}
                {game.playerCount} ranked
              </p>
            </Link>
          </li>
        ))}

        {/* Sits in the grid as the last card, so adding a game reads as one more
            thing alongside the games rather than a separate destination. */}
        <li>
          <Link
            href="/games/new"
            className="flex h-full min-h-[4.75rem] items-center justify-center rounded-xl border border-dashed border-[var(--color-line)] px-5 py-4 text-sm font-semibold text-[var(--color-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            + New game
          </Link>
        </li>
      </ul>

      {games.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">
          No games yet. Add one to start logging matches.
        </p>
      )}
    </div>
  );
}
