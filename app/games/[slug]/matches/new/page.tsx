import { notFound } from "next/navigation";
import Link from "next/link";
import { getGame, listPlayers } from "@/lib/queries";
import { formatFormat } from "@/lib/format";
import MatchForm from "./match-form";

export const dynamic = "force-dynamic";

export default async function NewMatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();

  const players = await listPlayers();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href={`/games/${game.slug}`}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          ← {game.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Log a match</h1>
        <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
          {formatFormat(game)}
        </p>
      </div>
      <MatchForm game={game} knownPlayers={players.map((p) => p.name)} />
    </div>
  );
}
