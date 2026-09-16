"use client";

import Link from "next/link";
import { deleteStrikeoutAction } from "@/app/actions";
import type { StrikeoutEntry, StrikeoutStanding } from "@/lib/queries";
import { formatHouseDay } from "@/lib/house-day";

export default function StrikeoutBoards({
  standings,
  recent,
}: {
  standings: StrikeoutStanding[];
  recent: StrikeoutEntry[];
}) {
  // Two views of one set of players; only those with a strikeout are ranked.
  const ranked = standings.filter((s) => s.total > 0);

  const byDay = [...ranked].sort(
    (a, b) => b.bestDay - a.bestDay || b.total - a.total || a.name.localeCompare(b.name),
  );
  const byTotal = [...ranked].sort(
    (a, b) => b.total - a.total || b.bestDay - a.bestDay || a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <Board
          title="Single-day record"
          caption="Most in one 6am–6am day"
          rows={byDay}
          value={(s) => s.bestDay}
          detail={(s) => (s.bestDayOn ? formatHouseDay(s.bestDayOn) : null)}
        />
        <Board
          title="All time"
          caption="Every strikeout ever logged"
          rows={byTotal}
          value={(s) => s.total}
          detail={(s) =>
            s.bestDay > 0 ? `best day ${s.bestDay}` : null
          }
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Recent
        </h2>
        {recent.length === 0 ? (
          <div className="panel px-5 py-8 text-center text-sm text-[var(--color-muted)]">
            Nothing logged yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <span className="font-medium">{entry.playerName}</span>
                  <span className="ml-2 font-mono text-sm text-[var(--color-accent)]">
                    +{entry.amount}
                  </span>
                  {entry.note && (
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {entry.note}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
                  <span>{formatHouseDay(entry.houseDay)}</span>
                  <form action={deleteStrikeoutAction}>
                    <input type="hidden" name="strikeoutId" value={entry.id} />
                    <button className="underline hover:text-[var(--color-accent)]">
                      delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Board({
  title,
  caption,
  rows,
  value,
  detail,
}: {
  title: string;
  caption: string;
  rows: StrikeoutStanding[];
  value: (s: StrikeoutStanding) => number;
  detail: (s: StrikeoutStanding) => string | null;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {title}
        </h2>
        <p className="text-xs text-[var(--color-muted)]">{caption}</p>
      </div>
      {rows.length === 0 ? (
        <div className="panel px-5 py-8 text-center text-sm text-[var(--color-muted)]">
          Nobody yet.
        </div>
      ) : (
        <ol className="panel divide-y divide-[var(--color-line)]">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="w-4 shrink-0 font-mono text-xs text-[var(--color-muted)]">
                  {index + 1}
                </span>
                <Link
                  href="/players"
                  className="truncate font-medium hover:text-[var(--color-accent)]"
                >
                  {row.name}
                </Link>
              </div>
              <div className="flex shrink-0 items-baseline gap-3">
                {detail(row) && (
                  <span className="hidden text-xs text-[var(--color-muted)] sm:inline">
                    {detail(row)}
                  </span>
                )}
                <span className="font-mono font-semibold">{value(row)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
