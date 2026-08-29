"use client";

import { useEffect, useRef, useState } from "react";

type Opt = { value: string; label: string; desc?: string; filterKey?: string };

/**
 * Editable searchable dropdown. Submits `value` via a hidden field named `name`,
 * but shows the option's friendly `label` in the box. Click/tap the arrow (or field)
 * to open the full list, type to filter, arrow keys + Enter to pick, or type a new
 * value (free text allowed). Integrates with the global Enter-to-next-field keyboard
 * by stopping propagation only while the list is open.
 */
export function Combobox({
  name,
  options,
  defaultValue = "",
  placeholder,
  className = "input-box mono",
  descTargetId,
  filterByField,
}: {
  name: string;
  options: Opt[];
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  descTargetId?: string;
  /** Name of another form field whose current value must equal option.filterKey for the option to be shown. Empty other-field = show all. */
  filterByField?: string;
}) {
  const [filterVal, setFilterVal] = useState<string>("");
  useEffect(() => {
    if (!filterByField) return;
    const readVal = () => {
      const el = document.querySelector(`[name="${filterByField}"]`) as HTMLInputElement | null;
      setFilterVal((el?.value ?? "").trim());
    };
    readVal();
    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name === filterByField) setFilterVal((d.value ?? "").trim());
    };
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t?.name === filterByField) setFilterVal((t.value ?? "").trim());
    };
    document.addEventListener("combobox:change", onCombo);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    return () => {
      document.removeEventListener("combobox:change", onCombo);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
    };
  }, [filterByField]);
  const visibleOptions = !filterByField || !filterVal
    ? options
    : options.filter((o) => !o.filterKey || o.filterKey === filterVal);
  const mirrorDesc = (v: string) => {
    if (!descTargetId) return;
    const t = document.getElementById(descTargetId) as HTMLInputElement | null;
    if (t) t.value = options.find((o) => o.value === v)?.desc ?? "";
  };
  const [val, setVal] = useState(defaultValue); // submitted value
  const [typed, setTyped] = useState<string | null>(null); // non-null while the user is editing
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const display = typed !== null ? typed : val ? labelFor(val) : "";
  const q = (typed ?? "").trim().toLowerCase();
  const filtered = !q ? visibleOptions : visibleOptions.filter((o) => `${o.label} ${o.value} ${o.desc ?? ""}`.toLowerCase().includes(q));

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setTyped(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => {
    setSel(0);
  }, [typed, open]);

  useEffect(() => {
    mirrorDesc(val);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (o: Opt) => {
    setVal(o.value);
    setTyped(null);
    setOpen(false);
    mirrorDesc(o.value);
    document.dispatchEvent(
      new CustomEvent("combobox:change", { detail: { name, value: o.value } })
    );
    inputRef.current?.focus();
  };

  // Allow another component (e.g. a contract auto-fill) to push a value in.
  useEffect(() => {
    const onSet = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name !== name) return;
      setVal(d.value ?? "");
      setTyped(null);
      mirrorDesc(d.value ?? "");
    };
    document.addEventListener("combobox:set", onSet);
    return () => document.removeEventListener("combobox:set", onSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, options]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "F9") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }
      return; // closed: let Enter etc. bubble to the global next-field handler
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      const o = filtered[sel];
      if (o) {
        e.preventDefault();
        e.stopPropagation();
        choose(o);
      } else {
        setOpen(false);
        setTyped(null);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setTyped(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={val} readOnly />
      <input
        ref={inputRef}
        className={`${className} pr-7`}
        value={display}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setTyped(e.target.value);
          setVal(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <span
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
          inputRef.current?.focus();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] text-[10px] cursor-pointer select-none"
      >
        ▼
      </span>
      {open && filtered.length > 0 && (
        <div
          className="absolute z-30 left-0 right-0 mt-0.5 max-h-56 overflow-y-auto bg-white border border-[var(--border)] shadow-lg"
          role="listbox"
        >
          {filtered.map((o, i) => (
            <div
              key={`${o.value}-${i}`}
              role="option"
              aria-selected={i === sel}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setSel(i)}
              className={`px-2 py-1.5 text-[13px] mono cursor-pointer ${i === sel ? "bg-[var(--accent)] text-white" : ""}`}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
