"use client";

import { useRef, useState } from "react";
import { replaceActiveToken, suggestionsFor } from "@/lib/tokens";

/**
 * Comma-separated roster field with a token-aware typeahead: suggestions track
 * the name currently under the caret rather than the whole field, so they keep
 * working for the second and third player on a team.
 */
export default function PlayerNamesInput({
  name,
  value,
  onChange,
  known,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  known: string[];
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matches = open ? suggestionsFor(value, caret, known) : [];

  function accept(pick: string) {
    const next = replaceActiveToken(value, caret, pick);
    onChange(next.value);
    setOpen(false);
    setHighlight(0);
    // Restore the caret after React re-renders with the new value.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  }

  function sync(el: HTMLInputElement) {
    setCaret(el.selectionStart ?? el.value.length);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        name={name}
        className="field mt-1"
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          sync(e.target);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={(e) => {
          sync(e.target);
          setOpen(true);
        }}
        onClick={(e) => sync(e.currentTarget)}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            sync(e.currentTarget);
          }
        }}
        // Blur is deferred so a click on a suggestion lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            // Enter would otherwise submit the form mid-name.
            e.preventDefault();
            accept(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[var(--color-line)] bg-[#0f1317] shadow-lg">
          {matches.map((match, index) => (
            <li key={match}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  index === highlight
                    ? "bg-[var(--color-accent)] text-[#06281c]"
                    : "hover:bg-[#1b2128]"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => accept(match)}
              >
                {match}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
