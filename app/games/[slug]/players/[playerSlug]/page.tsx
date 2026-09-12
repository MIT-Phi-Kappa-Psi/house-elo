import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getGame,
  getPlayerBySlug,
  getPlayerHistory,
  getTeammateConcentration,
  listPlayerMatches,
} from "@/lib/queries";
import { displayRating } from "@/lib/rating";
import { formatDate, formatDelta } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string; playerSlug: string }>;
}) {
  const { slug, playerSlug } = await params;
  const [game, player] = await Promise.all([
    getGame(slug),
    getPlayerBySlug(playerSlug),
  ]);
  if (!game || !player) notFound();

  const [history, matches, teammates] = await Promise.all([
    getPlayerHistory(game.id, player.id),
    listPlayerMatches(game.id, player.id, 30),
    getTeammateConcentration(game.id, player.id),
  ]);

  const current = history.at(-1);
  const rating = current
    ? displayRating({ mu: current.mu, sigma: current.sigma })
    : 1000;

  const totalTeamGames = teammates.reduce((sum, t) => sum + t.gamesTogether, 0);
  const dominant =
    teammates[0] && totalTeamGames > 0 && history.length >= 5
      ? teammates[0].gamesTogether / history.length
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/games/${game.slug}`}
          className="text-xs text-[var(--color-muted)] hover:text-white"
        >
          ← {game.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{player.name}</h1>
        <p className="mt-1 font-mono text-sm text-[var(--color-muted)]">
          {rating}
          {current && (
            <span className="ml-2 text-xs">
              μ {current.mu.toFixed(1)} · σ {current.sigma.toFixed(2)}
            </span>
          )}
        </p>
      </div>

      {dominant >= 0.8 && (
        <div className="panel border-[var(--color-warn)] px-4 py-3 text-xs text-[var(--color-warn)]">
          {Math.round(dominant * 100)}% of matches here were played alongside{" "}
          {teammates[0].name}. The model cannot tell the two of you apart — this
          rating describes the pair more than the individual. Shuffle teams to
          separate them.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Rating over time
        </h2>
        {history.length < 2 ? (
          <div className="panel px-5 py-8 text-center text-sm text-[var(--color-muted)]">
            Not enough matches to chart yet.
          </div>
        ) : (
          <div className="panel px-4 py-4">
            <Sparkline values={history.map((h) => h.displayRating)} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Matches
        </h2>
        <ul className="space-y-2">
          {matches.map((match) => {
            const entry = history.find((h) => h.matchId === match.id);
            const best = Math.min(...match.teams.map((t) => t.rank));
            return (
              <li key={match.id} className="panel px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {match.teams.map((team, index) => (
                      <span key={team.teamIndex} className="flex items-center gap-2">
                        {index > 0 && (
                          <span className="text-xs text-[var(--color-muted)]">vs</span>
                        )}
                        <span
                          className={
                            team.rank === best
                              ? "text-[var(--color-accent)]"
                              : "text-[var(--color-muted)]"
                          }
                        >
                          {team.players.map((p) => p.name).join(" + ")}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    {entry && (
                      <span
                        className={
                          entry.delta > 0
                            ? "text-[var(--color-accent)]"
                            : entry.delta < 0
                              ? "text-[var(--color-warn)]"
                              : "text-[var(--color-muted)]"
                        }
                      >
                        {formatDelta(entry.delta)}
                      </span>
                    )}
                    <span className="text-[var(--color-muted)]">
                      {formatDate(match.playedAt)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {teammates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Most common teammates
          </h2>
          <ul className="panel divide-y divide-[var(--color-line)] text-sm">
            {teammates.map((mate) => (
              <li key={mate.slug} className="flex justify-between px-4 py-2">
                <Link
                  href={`/games/${game.slug}/players/${mate.slug}`}
                  className="hover:text-[var(--color-accent)]"
                >
                  {mate.name}
                </Link>
                <span className="font-mono text-xs text-[var(--color-muted)]">
                  {mate.gamesTogether}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 640;
  const height = 120;
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-32 w-full"
      role="img"
      aria-label={`Rating from ${values[0]} to ${values.at(-1)}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
