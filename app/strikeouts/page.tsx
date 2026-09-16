import { getStrikeoutStandings, listStrikeouts, listPlayers } from "@/lib/queries";
import { DAY_STARTS_AT_HOUR } from "@/lib/house-day";
import StrikeoutForm from "./strikeout-form";
import StrikeoutBoards from "./strikeout-boards";

export const dynamic = "force-dynamic";

export default async function StrikeoutsPage() {
  const [standings, recent, players] = await Promise.all([
    getStrikeoutStandings(),
    listStrikeouts(40),
    listPlayers(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Strikeouts</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Same players as the games. A day runs {DAY_STARTS_AT_HOUR}am to{" "}
          {DAY_STARTS_AT_HOUR}am, so anything after midnight counts toward the
          night before.
        </p>
      </div>

      <StrikeoutForm knownPlayers={players.map((p) => p.name)} />
      <StrikeoutBoards standings={standings} recent={recent} />
    </div>
  );
}
