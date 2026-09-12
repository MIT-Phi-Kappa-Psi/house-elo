/** Sample data, so a fresh deploy has something to look at. */
import "./env.mts";
import { closeDriver } from "../lib/db.js";
import { createGame, createMatch, findOrCreatePlayer } from "../lib/queries.js";

const NAMES = ["Jackson", "Sam", "Alex", "Kim", "Riley", "Jordan", "Casey", "Morgan"];

const pool = await createGame({
  name: "Pool",
  minTeamSize: 1,
  maxTeamSize: 1,
  teamsPerMatch: 2,
  allowsDraws: false,
});

const soccer = await createGame({
  name: "Five-a-side",
  minTeamSize: 4,
  maxTeamSize: 5,
  teamsPerMatch: 2,
  allowsDraws: true,
});

const players = [];
for (const name of NAMES) players.push(await findOrCreatePlayer(name));

// A hidden "true skill" per player, so the seeded ladder converges to a real
// ordering rather than noise.
const strength = new Map(players.map((p, i) => [p.id, 1 - i * 0.09]));
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

let when = Date.now() - 1000 * 60 * 60 * 24 * 60;

for (let i = 0; i < 60; i++) {
  const a = pick(players);
  let b = pick(players);
  while (b.id === a.id) b = pick(players);
  const aWins = Math.random() < 0.5 + (strength.get(a.id)! - strength.get(b.id)!) / 2;
  when += 1000 * 60 * 90;
  // Losing badly earns a lap; roughly a fifth of defeats here.
  const lapLoser = Math.random() < 0.2;
  await createMatch({
    gameId: pool.id,
    playedAt: new Date(when),
    teams: [
      { rank: aWins ? 1 : 2, playerIds: [a.id], nakedLap: lapLoser && !aWins },
      { rank: aWins ? 2 : 1, playerIds: [b.id], nakedLap: lapLoser && aWins },
    ],
  });
}

for (let i = 0; i < 20; i++) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const teamA = shuffled.slice(0, 4);
  const teamB = shuffled.slice(4, 8);
  const sum = (t: typeof teamA) => t.reduce((n, p) => n + strength.get(p.id)!, 0);
  const draw = Math.random() < 0.15;
  const aWins = sum(teamA) > sum(teamB);
  when += 1000 * 60 * 60 * 24;
  await createMatch({
    gameId: soccer.id,
    playedAt: new Date(when),
    teams: [
      { rank: draw ? 1 : aWins ? 1 : 2, playerIds: teamA.map((p) => p.id) },
      { rank: draw ? 1 : aWins ? 2 : 1, playerIds: teamB.map((p) => p.id) },
    ],
  });
}

await closeDriver();
console.log("Seeded 2 games, 8 players, 80 matches.");
