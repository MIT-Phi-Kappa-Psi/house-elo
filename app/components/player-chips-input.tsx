"use client";

import { useRef, useState } from "react";
import {
  addChip,
  canonicalName,
  filterSuggestions,
  normalizeName,
  shouldOfferNew,
} from "@/lib/chips";

/**
 * Chip picker for a team's roster. Selected players become removable chips; the
 * typed query narrows a dropdown of existing players. A name that matches
 * nobody can still be committed, and the server creates that player on submit —
 * but it is marked as new first, so a typo is visible rather than silently
 * forking someone's rating into a second identity.
 *
 * The form value is the chips comma-joined in a hidden input, which keeps the
 * server action's existing contract unchanged.
 */
export default function PlayerChipsInput({
  name,
  selected,
  onChange,
  known,
  max,
  placeholder = "Add a player…",
}: {
  name: string;
  selected: string[];
  onChange: (next: string[]) => void;
  known: string[];
  max?: number;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const full = max !== undefined && selected.length >= max;
  const matches = open && !full ? filterSuggestions(query, known, selected) : [];
  const offerNew = open && !full && shouldOfferNew(query, known, selected);
  // The "create" row sits after the matches, so highlight can land on it.
  const rowCount = matches.length + (offerNew ? 1 : 0);

  function commit(value: string) {
    const next = addChip(value, selected, known);
    if (next !== selected) onChange(next);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }

  function commitHighlighted() {
    if (highlight < matches.length) commit(matches[highlight]);
    else if (offerNew) commit(query);
  }

  function removeAt(index: number) {
    onChange(selected.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  return (
    <div className="relative mt-1">
      <input type="hidden" name={name} value={selected.join(", ")} />

      <div
        className="field flex flex-wrap items-center gap-1.5 py-2"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((player, index) => {
          const isNew = !canonicalName(player, known);
          return (
            <span
              key={`${player}-${index}`}
              className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs ${
                isNew
                  ? "bg-[#3a2f0c] text-[var(--color-warn)]"
                  : "bg-[#24405c] text-[#cfe3ff]"
              }`}
            >
              {player}
              {isNew && <span className="opacity-70">new</span>}
              <button
                type="button"
                aria-label={`Remove ${player}`}
                className="rounded-full px-2 text-base leading-none opacity-60 hover:opacity-100"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeAt(index);
                }}
              >
                ×
              </button>
            </span>
          );
        })}

        {full ? (
          <span className="py-0.5 text-xs text-[var(--color-muted)]">
            Team full ({max})
          </span>
        ) : (
          <input
            ref={inputRef}
            value={query}
            className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted)]"
            placeholder={selected.length === 0 ? placeholder : "Add another…"}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onFocus={() => setOpen(true)}
            // Deferred so a click on a row lands before the list closes.
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && query === "" && selected.length > 0) {
                removeAt(selected.length - 1);
                return;
              }
              if (e.key === "Enter" || e.key === ",") {
                // Enter would otherwise submit the match mid-name.
                e.preventDefault();
                if (rowCount > 0) commitHighlighted();
                else if (normalizeName(query)) commit(query);
                return;
              }
              if (rowCount === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => (h + 1) % rowCount);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => (h - 1 + rowCount) % rowCount);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        )}
      </div>

      {rowCount > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[var(--color-line)] bg-[#0f1317] shadow-lg">
          {matches.map((match, index) => (
            <li key={match}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  index === highlight
                    ? "bg-[var(--color-accent)] text-[#06281c]"
                    : "hover:bg-[#1b2128]"
                }`}
                // Commit on pointer-down, not click: on a touch screen the
                // keyboard dismissing blurs the input and tears this list down
                // before a click would ever land. preventDefault also keeps
                // focus in the field. Covers mouse, touch and pen alike.
                onPointerDown={(e) => {
                  e.preventDefault();
                  commit(match);
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                {match}
              </button>
            </li>
          ))}
          {offerNew && (
            <li className={matches.length > 0 ? "border-t border-[var(--color-line)]" : ""}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  highlight === matches.length
                    ? "bg-[var(--color-warn)] text-[#2a1f00]"
                    : "hover:bg-[#1b2128]"
                }`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  commit(query);
                }}
                onMouseEnter={() => setHighlight(matches.length)}
              >
                Add “{normalizeName(query)}” as a new player
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
