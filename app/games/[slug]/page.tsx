import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getGame,
  getLeaderboard,
  listMatches,
  PROVISIONAL_MATCHES,
} from "@/lib/queries";
import { formatDate, formatFormat } from "@/lib/format";
import { voidMatchAction, recomputeAction } from "@/app/actions";
import NakedLap from "@/app/components/naked-lap";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();

  const [rows, matches] = await Promise.all([
    getLeaderboard(game.id),
    listMatches(game.id, 25),
  ]);

  const ranked = rows.filter((r) => !r.provisional);
  const provisional = rows.filter((r) => r.provisional);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{game.name}</h1>
          <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
            {formatFormat(game)}
            {game.allowsDraws ? " · draws allowed" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={recomputeAction}>
            <input type="hidden" name="gameSlug" value={game.slug} />
            <button className="btn btn-ghost" title="Replay the match log from scratch">
              Recompute
            </button>
          </form>
          <Link href={`/games/${game.slug}/matches/new`} className="btn btn-primary">
            Log a match
          </Link>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Leaderboard
        </h2>
        {ranked.length === 0 && provisional.length === 0 ? (
          <div className="panel px-5 py-10 text-center text-sm text-[var(--color-muted)]">
            No matches logged yet.
          </div>
        ) : (
          // Wide content scrolls inside its own box; the page body never does.
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr className="border-b border-[var(--color-line)]">
                  <th className="px-4 py-3 text-left font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">Player</th>
                  <th className="px-4 py-3 text-right font-medium">Rating</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    W–L–D
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
                    Played
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, index) => (
                  <Row key={row.playerId} row={row} position={index + 1} game={game.slug} />
                ))}
                {provisional.length > 0 && (
                  <tr className="border-t border-[var(--color-line)] bg-[var(--color-ink)]">
                    <td
                      colSpan={5}
                      className="px-4 py-2 text-xs text-[var(--color-muted)]"
                    >
                      Placing — under {PROVISIONAL_MATCHES} matches, rating still settling
                    </td>
                  </tr>
                )}
                {provisional.map((row) => (
                  <Row key={row.playerId} row={row} position={null} game={game.slug} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Recent matches
        </h2>
        {matches.length === 0 ? (
          <div className="panel px-5 py-8 text-center text-sm text-[var(--color-muted)]">
            Nothing logged yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {matches.map((match) => (
              <li
                key={match.id}
                className={`panel px-4 py-3 ${match.voided ? "opacity-40" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {match.teams.map((team, index) => (
                      <span key={team.teamIndex} className="flex items-center gap-2">
                        {index > 0 && (
                          <span className="text-xs text-[var(--color-muted)]">vs</span>
                        )}
                        <span
                          className={
                            team.rank === Math.min(...match.teams.map((t) => t.rank))
                              ? "font-semibold text-[var(--color-good)]"
                              : "text-[var(--color-muted)]"
                          }
                        >
                          {team.players.map((p) => p.name).join(" + ") || "—"}
                          {team.score !== null && (
                            <span className="ml-1 font-mono text-xs">({team.score})</span>
                          )}
                        </span>
                        {team.nakedLap && <NakedLap />}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
                    <span>{formatDate(match.playedAt)}</span>
                    <form action={voidMatchAction}>
                      <input type="hidden" name="matchId" value={match.id} />
                      <input type="hidden" name="gameSlug" value={game.slug} />
                      <input
                        type="hidden"
                        name="voided"
                        value={match.voided ? "false" : "true"}
                      />
                      <button className="underline hover:text-white">
                        {match.voided ? "restore" : "void"}
                      </button>
                    </form>
                  </div>
                </div>
                {match.note && (
                  <p className="mt-1 text-xs text-[var(--color-muted)]">{match.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({
  row,
  position,
  game,
}: {
  row: Awaited<ReturnType<typeof getLeaderboard>>[number];
  position: number | null;
  game: string;
}) {
  return (
    <tr className="border-t border-[var(--color-line)]">
      <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted)]">
        {position ?? "–"}
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/games/${game}/players/${row.slug}`}
          className="hover:text-[var(--color-accent)]"
        >
          {row.name}
        </Link>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold">
        {row.displayRating}
        <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">
          ±{Math.round(row.sigma * 40)}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-[var(--color-muted)]">
        {row.wins}–{row.losses}
        {row.draws > 0 ? `–${row.draws}` : ""}
      </td>
      <td className="hidden px-4 py-3 text-right font-mono text-xs text-[var(--color-muted)] sm:table-cell">
        {row.matchesPlayed}
      </td>
    </tr>
  );
}
