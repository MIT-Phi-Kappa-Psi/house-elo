/**
 * Editing helpers for the comma-separated roster field.
 *
 * A `<datalist>` cannot drive this: the browser matches its options against the
 * input's entire value, so once the field reads "Sam, K" it looks for a player
 * literally named "Sam, K". These helpers operate on the single token under the
 * caret instead, which is what makes suggestions keep working past the first
 * name.
 */
export type TokenRange = { start: number; end: number; text: string };

/** The comma-delimited token containing `caret`. */
export function activeToken(value: string, caret: number): TokenRange {
  const clamped = Math.max(0, Math.min(caret, value.length));
  const start = value.lastIndexOf(",", clamped - 1) + 1;
  const nextComma = value.indexOf(",", clamped);
  const end = nextComma === -1 ? value.length : nextComma;
  return { start, end, text: value.slice(start, end).trim() };
}

/**
 * Replace the token under the caret with `name`, returning the new value and
 * where the caret should land. Appends ", " so the next name can be typed
 * straight away, but only when this is the last token.
 */
export function replaceActiveToken(
  value: string,
  caret: number,
  name: string,
): { value: string; caret: number } {
  const { start, end } = activeToken(value, caret);
  const prefix = value.slice(0, start);
  const suffix = value.slice(end);
  const spacer = start > 0 ? " " : "";
  const trailing = suffix.trim() === "" ? ", " : "";
  const next = `${prefix}${spacer}${name}${trailing}${trailing ? "" : suffix}`;
  return { value: next, caret: prefix.length + spacer.length + name.length + trailing.length };
}

/**
 * Candidate names for the token under the caret: a case-insensitive substring
 * match, with names already used elsewhere in the field removed so a player
 * cannot be suggested onto the same team twice.
 */
export function suggestionsFor(
  value: string,
  caret: number,
  known: string[],
  limit = 6,
): string[] {
  const { text, start, end } = activeToken(value, caret);
  const others = new Set(
    value
      .split(",")
      .map((part, index, parts) => {
        // Rebuild each token's offset to know which one is active.
        const offset = parts.slice(0, index).reduce((n, p) => n + p.length + 1, 0);
        return { name: part.trim().toLowerCase(), offset };
      })
      .filter(({ offset, name }) => name && (offset < start || offset >= end))
      .map(({ name }) => name),
  );

  const needle = text.toLowerCase();
  const pool = known.filter((name) => !others.has(name.toLowerCase()));
  if (!needle) return pool.slice(0, limit);

  const starts = pool.filter((name) => name.toLowerCase().startsWith(needle));
  const contains = pool.filter(
    (name) =>
      !name.toLowerCase().startsWith(needle) && name.toLowerCase().includes(needle),
  );
  // Prefix matches first; they're what the typist almost always means.
  return [...starts, ...contains].slice(0, limit);
}
