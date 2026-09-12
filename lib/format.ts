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
  teamsPerMatch: number;
}): string {
  const { minTeamSize: min, maxTeamSize: max, teamsPerMatch: teams } = game;
  // A fixed size reads best as "3v3"; a range does not, so spell it out.
  if (min !== max) {
    return `${min}\u2013${max} per side, ${teams} teams`;
  }
  return Array.from({ length: teams }, () => String(min)).join("v");
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
