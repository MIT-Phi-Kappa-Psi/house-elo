import { listPlayerDirectory } from "@/lib/queries";
import PlayerDirectory from "./player-directory";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await listPlayerDirectory();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Players</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Everyone who has appeared in a match, across every game, ranked by naked
          laps owed. The list grows on its own as new names are entered.
        </p>
      </div>
      <PlayerDirectory players={players} />
    </div>
  );
}
