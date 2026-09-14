"use client";

import { useEffect, useRef, useState } from "react";

const NATIVE_DATE = "date" as const;

const isoToDisplay = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

/**
 * Parse a typed day-first date. The year must be exactly 2 or 4 digits — NOT
 * 2-to-4: a half-typed "202" would otherwise parse and produce "202-10-01".
 * The day/month are checked against a real calendar so 31/02 is rejected
 * rather than silently rolling into March.
 */
const displayToIso = (txt: string) => {
  const m = /^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})$/.exec((txt ?? "").trim());
  if (!m) return "";
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/**
 * Day-first date box.
 *
 * A native browser date control paints its text in the BROWSER's locale, not
 * the document's, so on a US-locale browser 1 September read as 09/01/2026.
 * This paints DD/MM/YYYY itself and submits ISO through a hidden input under
 * the real field name, so nothing downstream changes.
 *
 * While the box has focus the typed text is the ONLY source of truth — nothing
 * rewrites it mid-keystroke. Normalising happens on blur.
 */
export function DateBox({
  name,
  defaultValue = "",
  className = "input-box mono",
  required,
  disabled,
  id,
  title,
}: {
  name?: string;
  defaultValue?: string | null;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  title?: string;
}) {
  const [iso, setIso] = useState(defaultValue ?? "");
  const [text, setText] = useState(isoToDisplay(defaultValue ?? ""));
  const hiddenRef = useRef<HTMLInputElement>(null);
  // True while WE are writing the hidden field. Without this the sync listener
  // below hears our own commit and overwrites the half-typed text with a
  // reformatted date — typing "01/10/20" became "01/10/2020" under the cursor.
  const selfWrite = useRef(false);
  const focused = useRef(false);

  // Follow writes made by something else (AutoFill, row-erase, a sibling calc).
  useEffect(() => {
    const el = hiddenRef.current;
    if (!el) return;
    const sync = () => {
      if (selfWrite.current || focused.current) return;
      const v = el.value ?? "";
      setIso(v);
      setText(isoToDisplay(v));
    };
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
    return () => {
      el.removeEventListener("input", sync);
      el.removeEventListener("change", sync);
    };
  }, []);

  const commit = (nextIso: string) => {
    setIso(nextIso);
    const el = hiddenRef.current;
    if (!el) return;
    selfWrite.current = true;
    el.value = nextIso;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    selfWrite.current = false;
  };

  return (
    // flex, not block: around an inline input a block wrapper also inherits the
    // line-box descender, so the field's height moved with the font and knocked
    // it out of line with its neighbours in the `items-end` filter bars.
    <span className="relative flex" style={{ minWidth: 132 }}>
      <input type="hidden" ref={hiddenRef} name={name} value={iso} readOnly />
      <input
        id={id}
        title={title}
        className={`${className} pr-7 w-full min-w-0`}
        value={text}
        placeholder="DD/MM/YYYY"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          // Show exactly what was typed. Commit only once it is a real date, so
          // a partial entry never writes a wrong value, and never blank the box
          // just because it is not finished yet.
          const typed = e.target.value;
          setText(typed);
          if (!typed.trim()) {
            commit("");
            return;
          }
          const next = displayToIso(typed);
          if (next) commit(next);
        }}
        onBlur={() => {
          focused.current = false;
          // Tidy a valid entry into DD/MM/YYYY; leave anything unparseable as
          // typed so the operator can see and correct it.
          const next = displayToIso(text);
          if (next) {
            if (next !== iso) commit(next);
            setText(isoToDisplay(next));
          } else if (!text.trim()) {
            setText("");
          }
        }}
      />
      {/* A visible calendar mark so the picker is findable — the operator should
          never have to type a date by hand. Drawn as an SVG rather than an emoji:
          an emoji falls back to whatever font the OS has, and on some machines
          that glyph is taller than the input, which pushed the whole field out of
          line with its neighbours. An SVG has fixed metrics everywhere. The
          native control sits transparent on top and opens the OS picker. */}
      <span
        aria-hidden
        className="absolute right-0 top-0 h-full w-7 flex items-center justify-center text-[var(--muted)] pointer-events-none"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="1.5" y="3" width="13" height="11.5" rx="1" />
          <path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" />
        </svg>
      </span>
      <input
        type={NATIVE_DATE}
        tabIndex={-1}
        aria-label="Open date picker"
        title="Pick a date"
        disabled={disabled}
        value={iso}
        onChange={(e) => {
          commit(e.target.value);
          setText(isoToDisplay(e.target.value));
        }}
        className="absolute right-0 top-0 h-full w-7 opacity-0 cursor-pointer"
      />
    </span>
  );
}
