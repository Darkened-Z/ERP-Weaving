"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Data-entry controls we walk with Enter. Excludes hidden/submit/button controls.
const FIELD_SELECTOR =
  'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])';

function isVisible(el: HTMLElement) {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

function fieldsIn(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(isVisible);
}

function focusAndSelect(el: HTMLElement | undefined | null) {
  if (!el) return;
  el.focus();
  const input = el as HTMLInputElement;
  if (typeof input.select === "function" && input.type !== "date" && input.type !== "number") {
    input.select();
  }
}

// KEY-NEXT-ITEM: move to the next visible field, or submit when on the last one.
// Shared by the Enter handler and the LovPopup so both advance identically.
function advanceFrom(field: HTMLElement) {
  const form = field.closest("form");
  if (!form) return;
  const fields = fieldsIn(form);
  const i = fields.indexOf(field);
  const next = fields[i + 1];
  if (next) focusAndSelect(next);
  else form.requestSubmit();
}

// Build LOV rows for a lookup field: a <datalist> (input[list]) or a <select>'s own options.
// Returns null when there is nothing worth showing.
function lovOptionsFor(field: HTMLInputElement | HTMLSelectElement): { value: string; label: string }[] | null {
  if (field.tagName === "SELECT") {
    const options = Array.from((field as HTMLSelectElement).options)
      .map((o) => ({ value: o.value, label: (o.textContent || o.value).trim() }))
      .filter((o) => o.value !== "" && o.label !== "—" && o.label !== "-");
    return options.length ? options : null;
  }
  const listId = field.getAttribute("list");
  const dl = listId ? (document.getElementById(listId) as HTMLDataListElement | null) : null;
  if (!dl) return null;
  const options = Array.from(dl.querySelectorAll("option")).map((o) => ({
    value: (o as HTMLOptionElement).value,
    label: o.textContent?.trim() || (o as HTMLOptionElement).value,
  }));
  return options.length ? options : null;
}

function clickByText(match: (t: string) => boolean) {
  const el = Array.from(document.querySelectorAll<HTMLElement>("a, button")).find(
    (x) => isVisible(x) && !x.hasAttribute("disabled") && match(x.textContent?.trim().toLowerCase() ?? "")
  );
  if (el) {
    el.click();
    return true;
  }
  return false;
}

/**
 * Global keyboard behaviour mirroring the original Oracle Forms muscle memory, plus modern guards.
 *   Enter        -> next field  (KEY-NEXT-ITEM); submits when on the last field
 *   Up / Down    -> move between grid rows, same column  (KEY-UP / KEY-DOWN)
 *   Ctrl/Cmd+S / F10 -> save the current form  (KEY-COMMIT)
 *   Alt+N / Alt+P -> New / Print
 * Also: autofocus the first field on entry pages, warn on unsaved changes, and show a shortcut hint bar.
 * Enhances every native <form> on the page — no per-page wiring.
 */
export function FormKeyboard() {
  const pathname = usePathname();
  const [hasForm, setHasForm] = useState(false);
  const [lov, setLov] = useState<{
    options: { value: string; label: string }[];
    field: HTMLInputElement | HTMLSelectElement;
    advanceOnPick: boolean;
  } | null>(null);
  const dirty = useRef(false);

  // Per-page: reset dirty flag, detect entry form, put the cursor in the first field (like Oracle).
  useEffect(() => {
    dirty.current = false;
    const id = window.setTimeout(() => {
      let found = false;
      for (const form of Array.from(document.forms)) {
        const hasSubmit =
          !!form.querySelector("[type=submit]") ||
          (!!form.id && !!document.querySelector(`[type=submit][form="${form.id}"]`));
        const fields = fieldsIn(form);
        if (hasSubmit && fields.length >= 3) {
          found = true;
          const active = document.activeElement as HTMLElement | null;
          if (!active || active === document.body || active.tagName === "BODY") focusAndSelect(fields[0]);
          break;
        }
      }
      setHasForm(found);
    }, 60);
    return () => window.clearTimeout(id);
  }, [pathname]);

  // Keyboard behaviour.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[role="dialog"]')) return; // command palette / modals own their keys

      // New / Print mnemonics
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.code === "KeyN") {
          if (clickByText((t) => t === "new")) e.preventDefault();
          return;
        }
        if (e.code === "KeyP") {
          if (clickByText((t) => t === "print" || t.includes("print"))) e.preventDefault();
          return;
        }
      }

      // Save — Ctrl/Cmd+S or F10
      if ((e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey)) || e.key === "F10") {
        const form =
          target.closest("form") ||
          document.querySelector<HTMLButtonElement>("button[type=submit]")?.form ||
          null;
        if (form) {
          e.preventDefault();
          form.requestSubmit();
        }
        return;
      }

      const field = target.closest<HTMLElement>("input, select, textarea");
      if (!field) return;
      const form = field.closest("form");
      if (!form) return;

      // F9 — open a searchable List-of-Values from the field's <datalist> or a <select>'s options
      if (e.key === "F9") {
        const f = field as HTMLInputElement | HTMLSelectElement;
        const options = lovOptionsFor(f);
        if (options) {
          e.preventDefault();
          setLov({ options, field: f, advanceOnPick: false });
        }
        return;
      }

      // F3 — duplicate the value from the same column one row up (grid)
      if (e.key === "F3") {
        const cell = field.closest("td");
        const row = field.closest("tr");
        const body = field.closest("tbody");
        if (cell && row && body) {
          const col = (cell as HTMLTableCellElement).cellIndex;
          const rows = Array.from(body.rows);
          const idx = rows.indexOf(row as HTMLTableRowElement);
          const prev = rows[idx - 1]?.cells[col]?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select, textarea");
          if (prev) {
            e.preventDefault();
            (field as HTMLInputElement).value = prev.value;
            field.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        return;
      }

      // Grid row navigation — Up/Down move to the same column of the adjacent row
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const cell = field.closest("td");
        const row = field.closest("tr");
        const body = field.closest("tbody");
        if (cell && row && body) {
          const col = (cell as HTMLTableCellElement).cellIndex;
          const rows = Array.from(body.rows);
          const idx = rows.indexOf(row as HTMLTableRowElement);
          const nextRow = rows[idx + (e.key === "ArrowDown" ? 1 : -1)];
          const next = nextRow?.cells[col]?.querySelector<HTMLElement>("input, select, textarea");
          if (next) {
            e.preventDefault();
            focusAndSelect(next);
          }
        }
        return;
      }

      // Enter — on a lookup field open the LOV (pick-then-advance); otherwise go to next field
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (field.tagName === "TEXTAREA") return; // let textareas take a newline
        const f = field as HTMLInputElement | HTMLSelectElement;
        const isLookup = f.tagName === "SELECT" || (f.tagName !== "SELECT" && f.hasAttribute("list"));
        if (isLookup) {
          const options = lovOptionsFor(f);
          if (options) {
            e.preventDefault();
            setLov({ options, field: f, advanceOnPick: true });
            return;
          }
        }
        e.preventDefault();
        advanceFrom(field);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Unsaved-changes guard — mark the form dirty on edit, warn before leaving the page.
  useEffect(() => {
    function onInput(e: Event) {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("form") && !t.closest('[role="dialog"]')) dirty.current = true;
    }
    function onSubmit() {
      dirty.current = false;
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const Key = ({ children }: { children: React.ReactNode }) => (
    <kbd className="mono border border-[var(--border-light)] px-1 leading-none">{children}</kbd>
  );

  return (
    <>
      {hasForm && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-56 z-20 border-t border-[var(--border-light)] bg-white/95 backdrop-blur-sm px-4 py-1 flex items-center gap-4 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] pointer-events-none select-none">
          <span className="flex items-center gap-1"><Key>Enter</Key> next</span>
          <span className="flex items-center gap-1"><Key>↑↓</Key> row</span>
          <span className="flex items-center gap-1"><Key>F9</Key> lookup</span>
          <span className="hidden sm:flex items-center gap-1"><Key>F3</Key> dup</span>
          <span className="flex items-center gap-1"><Key>Ctrl</Key><Key>S</Key> save</span>
          <span className="hidden sm:flex items-center gap-1"><Key>Alt</Key><Key>N</Key> new</span>
        </div>
      )}
      {lov && (
        <LovPopup
          options={lov.options}
          field={lov.field}
          advanceOnPick={lov.advanceOnPick}
          onClose={() => setLov(null)}
        />
      )}
    </>
  );
}

function LovPopup({
  options,
  field,
  advanceOnPick,
  onClose,
}: {
  options: { value: string; label: string }[];
  field: HTMLInputElement | HTMLSelectElement;
  advanceOnPick?: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = q.trim()
    ? options.filter((o) => `${o.label} ${o.value}`.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  useEffect(() => {
    setSel(0);
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function pick(value: string) {
    field.value = value;
    // selects only react to "change"; inputs listen for "input" — fire both.
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    onClose();
    if (advanceOnPick) advanceFrom(field);
    else field.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = filtered[sel];
      if (row) pick(row.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      field.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white border-2 border-black w-full max-w-[480px] shadow-lg"
        style={{ maxHeight: "60vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-2 border-black flex items-center justify-between pr-2">
          <input
            ref={inputRef}
            className="input-box border-0 text-[14px]"
            placeholder="F9 — search list of values…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="mono text-[10px] text-[var(--muted)]">{filtered.length}</span>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin" style={{ minHeight: 0 }}>
          {filtered.length === 0 && (
            <div className="p-4 text-center text-[13px] text-[var(--muted)]">No matches</div>
          )}
          {filtered.map((o, i) => (
            <div
              key={`${o.value}-${i}`}
              data-i={i}
              onMouseEnter={() => setSel(i)}
              onClick={() => pick(o.value)}
              className={`px-3 py-1.5 cursor-pointer border-b border-[var(--border-light)] text-[13px] mono ${
                i === sel ? "bg-black text-white" : ""
              }`}
            >
              {o.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
