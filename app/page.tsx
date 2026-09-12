import Link from "next/link";
import { listGames } from "@/lib/queries";
import { formatFormat } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const games = await listGames();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Games</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Each game keeps its own independent ratings.
          </p>
        </div>
        <Link href="/games/new" className="btn btn-primary">
          Add a game
        </Link>
      </div>

      {games.length === 0 ? (
        <div className="panel px-5 py-10 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            No games yet. Add one to start logging matches.
          </p>
        </div>
      ) : (
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
        </ul>
      )}
    </div>
  );
}
