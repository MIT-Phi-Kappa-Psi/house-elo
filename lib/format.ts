/** Split a comma-separated roster field into clean player names. */
export function parseNames(raw: string): string[] {
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function formatFormat(game: {
  minTeamSize: number;
  maxTeamSize: number;
  minTeamsPerMatch: number;
  maxTeamsPerMatch: number;
}): string {
  const { minTeamSize: min, maxTeamSize: max } = game;
  const { minTeamsPerMatch: minT, maxTeamsPerMatch: maxT } = game;

  // A fixed shape reads best as "3v3"; any range has to be spelled out.
  if (min === max && minT === maxT) {
    return Array.from({ length: minT }, () => String(min)).join("v");
  }
  const side = min === max ? String(min) : `${min}\u2013${max}`;
  const teams = minT === maxT ? `${minT} teams` : `${minT}\u2013${maxT} teams`;
  return `${side} per side, ${teams}`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}
