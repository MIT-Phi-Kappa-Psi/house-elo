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
  createStrikeouts,
  deleteStrikeout,
} from "@/lib/queries";
import { TICKET_KINDS, type TicketKind } from "@/lib/tickets";
import { AUTH_COOKIE, expectedToken, tokenFor } from "@/lib/auth";
import { parseNames } from "@/lib/format";
import { fromHouseLocal } from "@/lib/house-day";

export type ActionState = { error?: string; ok?: string } | null;

export async function createGameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the game a name." };

  const minTeamSize = Number(formData.get("minTeamSize") ?? 1);
  const maxTeamSize = Number(formData.get("maxTeamSize") ?? minTeamSize);
  const minTeamsPerMatch = Number(formData.get("minTeamsPerMatch") ?? 2);
  const maxTeamsPerMatch = Number(formData.get("maxTeamsPerMatch") ?? minTeamsPerMatch);
  const allowsDraws = formData.get("allowsDraws") === "on";

  if (!Number.isInteger(minTeamSize) || minTeamSize < 1) {
    return { error: "Minimum team size must be at least 1." };
  }
  if (!Number.isInteger(maxTeamSize) || maxTeamSize < minTeamSize) {
    return { error: "Maximum team size must be at least the minimum." };
  }
  if (!Number.isInteger(minTeamsPerMatch) || minTeamsPerMatch < 2) {
    return { error: "A match needs at least 2 teams." };
  }
  if (!Number.isInteger(maxTeamsPerMatch) || maxTeamsPerMatch < minTeamsPerMatch) {
    return { error: "Maximum teams must be at least the minimum." };
  }

  const game = await createGame({
    name,
    minTeamSize,
    maxTeamSize,
    minTeamsPerMatch,
    maxTeamsPerMatch,
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

  const teamCount = Number(formData.get("teamCount") ?? game.minTeamsPerMatch);
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

  if (teams.length < game.minTeamsPerMatch) {
    return {
      error:
        `${game.name} needs at least ${game.minTeamsPerMatch} teams; ` +
        `${teams.length} had players.`,
    };
  }
  if (teams.length > game.maxTeamsPerMatch) {
    return {
      error: `${game.name} allows at most ${game.maxTeamsPerMatch} teams.`,
    };
  }

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
  const playedAt = playedAtRaw ? fromHouseLocal(playedAtRaw) : new Date();
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

export async function createStrikeoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const names = parseNames(String(formData.get("players") ?? ""));
  if (names.length === 0) return { error: "Pick a player." };
  // One strikeout per entry. Enforced here rather than only in the form, so a
  // hand-rolled submission cannot log a batch either.
  if (names.length > 1) return { error: "Log one strikeout at a time." };

  const raw = String(formData.get("occurredAt") ?? "").trim();
  // A bare datetime-local value means house wall-clock time, not server time.
  const occurredAt = raw ? fromHouseLocal(raw) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return { error: "That time could not be read." };

  const player = await findOrCreatePlayer(names[0]);

  await createStrikeouts({
    playerIds: [player.id],
    amount: 1,
    occurredAt,
    note: String(formData.get("note") ?? "").trim() || null,
  });

  revalidatePath("/strikeouts");
  return { ok: `Logged one for ${player.name}.` };
}

export async function deleteStrikeoutAction(formData: FormData): Promise<void> {
  const id = String(formData.get("strikeoutId") ?? "");
  if (!id) return;
  await deleteStrikeout(id);
  revalidatePath("/strikeouts");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const expected = await expectedToken();
  const next = String(formData.get("next") ?? "/");
  const destination = next.startsWith("/") ? next : "/";
  if (!expected) redirect(destination);

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

  redirect(destination);
}
