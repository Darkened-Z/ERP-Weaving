"use client";

import { useEffect, useRef, useState } from "react";

const NATIVE_DATE = "date" as const;

const isoToDisplay = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

const displayToIso = (txt: string) => {
  const m = /^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})$/.exec((txt ?? "").trim());
  if (!m) return "";
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  let y = m[3];
  if (y.length === 2) y = String(2000 + Number(y));
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return "";
  return `${y}-${mo}-${d}`;
};

/**
 * Day-first date box.
 *
 * A native browser date control renders its text in the BROWSER's locale, not
 * the document's — so on a US-locale browser every date read 09/01/2026 for the
 * 1st of September, and no document-level setting changes it. This paints
 * DD/MM/YYYY itself and submits ISO through a hidden input under the real field
 * name, so nothing downstream changes. The calendar button still opens the OS
 * picker through an invisible native control laid over it.
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

  // Follow programmatic writes to the hidden field (AutoFill, row-erase, a
  // sibling calc) so the visible text never drifts from what gets submitted.
  useEffect(() => {
    const el = hiddenRef.current;
    if (!el) return;
    const sync = () => {
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
    if (el) {
      el.value = nextIso;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  return (
    // A native date control carries its own intrinsic width; a bare text input
    // does not, so inside a flex filter bar it collapsed to a couple of
    // characters. Hold enough room for DD/MM/YYYY plus the calendar button.
    <span className="relative block" style={{ minWidth: 132 }}>
      <input type="hidden" ref={hiddenRef} name={name} value={iso} readOnly />
      <input
        id={id}
        title={title}
        className={`${className} pr-7`}
        value={text}
        placeholder="DD/MM/YYYY"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const next = displayToIso(e.target.value);
          if (next || !e.target.value.trim()) commit(next);
        }}
        onBlur={() => setText(isoToDisplay(iso))}
      />
      <input
        type={NATIVE_DATE}
        tabIndex={-1}
        aria-hidden
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
