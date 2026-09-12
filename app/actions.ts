"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  createGame,
  createMatch,
  findMergeConflicts,
  findOrCreatePlayer,
  findPlayerByName,
  getGame,
  getPlayerById,
  mergePlayers,
  recomputeGame,
  renamePlayer,
  setMatchVoided,
  createTicket,
  deleteTicket,
  setTicketStatus,
} from "@/lib/queries";
import {
  TICKET_KINDS,
  TICKET_STATUSES,
  type TicketKind,
  type TicketStatus,
} from "@/lib/tickets";
import { AUTH_COOKIE, expectedToken, tokenFor } from "@/lib/auth";
import { parseNames } from "@/lib/format";

export type ActionState = { error?: string; ok?: string } | null;

export async function createGameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the game a name." };

  const minTeamSize = Number(formData.get("minTeamSize") ?? 1);
  const maxTeamSize = Number(formData.get("maxTeamSize") ?? minTeamSize);
  const teamsPerMatch = Number(formData.get("teamsPerMatch") ?? 2);
  const allowsDraws = formData.get("allowsDraws") === "on";

  if (!Number.isInteger(minTeamSize) || minTeamSize < 1) {
    return { error: "Minimum team size must be at least 1." };
  }
  if (!Number.isInteger(maxTeamSize) || maxTeamSize < minTeamSize) {
    return { error: "Maximum team size must be at least the minimum." };
  }
  if (!Number.isInteger(teamsPerMatch) || teamsPerMatch < 2) {
    return { error: "A match needs at least 2 teams." };
  }

  const game = await createGame({
    name,
    minTeamSize,
    maxTeamSize,
    teamsPerMatch,
    allowsDraws,
  });
  revalidatePath("/");
  redirect(`/games/${game.slug}`);
}

export async function createMatchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gameSlug = String(formData.get("gameSlug") ?? "");
  const game = await getGame(gameSlug);
  if (!game) return { error: "Game not found." };

  const teamCount = Number(formData.get("teamCount") ?? game.teamsPerMatch);
  const teams: {
    rank: number;
    playerIds: string[];
    score: number | null;
    nakedLap: boolean;
  }[] = [];

  for (let i = 0; i < teamCount; i++) {
    const names = parseNames(String(formData.get(`team-${i}-players`) ?? ""));
    const rank = Number(formData.get(`team-${i}-rank`) ?? i + 1);
    const rawScore = String(formData.get(`team-${i}-score`) ?? "").trim();

    if (names.length === 0) continue;
    if (!Number.isInteger(rank) || rank < 1) {
      return { error: `Team ${i + 1} needs a placement of 1 or higher.` };
    }
    if (names.length < game.minTeamSize || names.length > game.maxTeamSize) {
      return {
        error:
          `Team ${i + 1} has ${names.length} player(s); ${game.name} expects ` +
          `${game.minTeamSize === game.maxTeamSize ? game.minTeamSize : `${game.minTeamSize}-${game.maxTeamSize}`}.`,
      };
    }

    const players = [];
    for (const name of names) players.push(await findOrCreatePlayer(name));

    const ids = players.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      return { error: `Team ${i + 1} lists the same player twice.` };
    }

    teams.push({
      rank,
      playerIds: ids,
      score: rawScore === "" ? null : Number(rawScore),
      nakedLap: formData.get(`team-${i}-nakedLap`) === "on",
    });
  }

  if (teams.length < 2) return { error: "Record at least two teams." };

  const seen = new Set<string>();
  for (const team of teams) {
    for (const id of team.playerIds) {
      if (seen.has(id)) return { error: "A player appears on more than one team." };
      seen.add(id);
    }
  }

  // Identical placements across every team is a legitimate full draw, so the
  // only rule here is that a game without draws needs distinct placements.
  const ranks = teams.map((t) => t.rank);
  if (!game.allowsDraws && new Set(ranks).size !== ranks.length) {
    return { error: `${game.name} does not allow draws — give each team a distinct placement.` };
  }

  const playedAtRaw = String(formData.get("playedAt") ?? "").trim();
  const playedAt = playedAtRaw ? new Date(playedAtRaw) : new Date();
  if (Number.isNaN(playedAt.getTime())) return { error: "That date could not be read." };

  const note = String(formData.get("note") ?? "").trim() || null;

  await createMatch({ gameId: game.id, playedAt, note, teams });
  revalidatePath(`/games/${game.slug}`);
  redirect(`/games/${game.slug}`);
}

export async function voidMatchAction(formData: FormData): Promise<void> {
  const matchId = String(formData.get("matchId") ?? "");
  const voided = formData.get("voided") === "true";
  const gameSlug = String(formData.get("gameSlug") ?? "");
  await setMatchVoided(matchId, voided);
  revalidatePath(`/games/${gameSlug}`);
}

export async function recomputeAction(formData: FormData): Promise<void> {
  const gameSlug = String(formData.get("gameSlug") ?? "");
  const game = await getGame(gameSlug);
  if (!game) return;
  await recomputeGame(game.id);
  revalidatePath(`/games/${gameSlug}`);
}

export async function renamePlayerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("playerId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A player needs a name." };

  const player = await getPlayerById(id);
  if (!player) return { error: "Player not found." };

  const clash = await findPlayerByName(name);
  if (clash && clash.id !== id) {
    return {
      error: `Another player is already called "${name}". Merge them instead of renaming.`,
    };
  }

  await renamePlayer(id, name);
  revalidatePath("/players");
  return { ok: `Renamed to ${name}.` };
}

export async function mergePlayersAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sourceId = String(formData.get("sourceId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");

  if (!sourceId || !targetId) return { error: "Pick both players." };
  if (sourceId === targetId) return { error: "Pick two different players." };

  const [source, target] = await Promise.all([
    getPlayerById(sourceId),
    getPlayerById(targetId),
  ]);
  if (!source || !target) return { error: "Player not found." };

  const conflicts = await findMergeConflicts(sourceId, targetId);
  if (conflicts.length > 0) {
    const first = conflicts[0];
    return {
      error:
        `${source.name} and ${target.name} both played in ${conflicts.length} of the same ` +
        `match(es) — for example ${first.gameName} on ` +
        `${first.playedAt.toLocaleDateString("en-US")}, ` +
        `${first.sameTeam ? "on the same team" : "against each other"}. ` +
        "Merging would put one person on both sides, so void or fix those matches first.",
    };
  }

  const { gamesRecomputed, matchesMoved } = await mergePlayers(sourceId, targetId);
  revalidatePath("/players");
  revalidatePath("/");
  return {
    ok:
      `Merged ${source.name} into ${target.name}: ${matchesMoved} match(es) moved, ` +
      `${gamesRecomputed} game(s) recomputed.`,
  };
}

export async function createTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the ticket a one-line summary." };
  if (title.length > 200) return { error: "Keep the summary under 200 characters." };

  const kind = String(formData.get("kind") ?? "bug") as TicketKind;
  if (!TICKET_KINDS.includes(kind)) return { error: "Pick a valid type." };

  await createTicket({
    title,
    body: String(formData.get("body") ?? "").trim() || null,
    reporter: String(formData.get("reporter") ?? "").trim() || null,
    kind,
  });
  revalidatePath("/tickets");
  return { ok: "Filed. Thanks — it'll get triaged." };
}

export async function setTicketStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "") as TicketStatus;
  if (!id || !TICKET_STATUSES.includes(status)) return;
  await setTicketStatus(id, status);
  revalidatePath("/tickets");
}

export async function deleteTicketAction(formData: FormData): Promise<void> {
  const id = String(formData.get("ticketId") ?? "");
  if (!id) return;
  await deleteTicket(id);
  revalidatePath("/tickets");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const expected = await expectedToken();
  if (!expected) redirect("/");

  const password = String(formData.get("password") ?? "");
  if ((await tokenFor(password)) !== expected) {
    return { error: "That password is not right." };
  }

  const store = await cookies();
  store.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") ? next : "/");
}
