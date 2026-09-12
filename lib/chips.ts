/**
 * Logic for the player chip input. Pure, so the selection rules are testable
 * without a DOM.
 */

/** Player names are stored comma-joined in the form, so commas cannot appear. */
export function normalizeName(raw: string): string {
  return raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The canonical spelling of `name` if that player already exists, else null.
 * Typing "jackson" should attach to the existing "Jackson" rather than look
 * like a new player, since the server matches names case-insensitively anyway.
 */
export function canonicalName(name: string, known: string[]): string | null {
  const needle = normalizeName(name).toLowerCase();
  if (!needle) return null;
  return known.find((k) => k.toLowerCase() === needle) ?? null;
}

export function isSelected(name: string, selected: string[]): boolean {
  const needle = normalizeName(name).toLowerCase();
  return selected.some((s) => s.toLowerCase() === needle);
}

/** Whether `name` can join `selected`: real, and not already on this team. */
export function canAdd(name: string, selected: string[]): boolean {
  const clean = normalizeName(name);
  return clean.length > 0 && !isSelected(clean, selected);
}

/**
 * Known players matching `query`, minus those already chosen. Prefix matches
 * rank above substring matches — that is nearly always what the typist means.
 */
export function filterSuggestions(
  query: string,
  known: string[],
  selected: string[],
  limit = 8,
): string[] {
  const pool = known.filter((name) => !isSelected(name, selected));
  const needle = normalizeName(query).toLowerCase();
  if (!needle) return pool.slice(0, limit);

  const starts = pool.filter((n) => n.toLowerCase().startsWith(needle));
  const contains = pool.filter(
    (n) => !n.toLowerCase().startsWith(needle) && n.toLowerCase().includes(needle),
  );
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Whether to offer "add as a new player". Suppressed when the query already
 * names an existing player, so creating someone stays a deliberate act rather
 * than the accidental result of a typo.
 */
export function shouldOfferNew(
  query: string,
  known: string[],
  selected: string[],
): boolean {
  const clean = normalizeName(query);
  if (!clean) return false;
  if (canonicalName(clean, known)) return false;
  return !isSelected(clean, selected);
}

/** Add `name` to `selected`, snapping to an existing player's spelling. */
export function addChip(name: string, selected: string[], known: string[]): string[] {
  const clean = canonicalName(name, known) ?? normalizeName(name);
  if (!canAdd(clean, selected)) return selected;
  return [...selected, clean];
}
