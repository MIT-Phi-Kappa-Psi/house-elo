import { getStrikeoutStandings, listStrikeouts, listPlayers } from "@/lib/queries";
import StrikeoutLogger from "./strikeout-form";
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
      <StrikeoutLogger knownPlayers={players.map((p) => p.name)} />
      <StrikeoutBoards standings={standings} recent={recent} />
    </div>
  );
}
