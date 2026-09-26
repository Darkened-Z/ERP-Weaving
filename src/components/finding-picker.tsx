"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Column = { key: string; label: string; width?: number; align?: "left" | "right" };
type Row = {
  value: string;
  code: string;
  description: string;
  extra?: string;
  filterKey?: string;
  /** Extra per-column values for the rich Oracle-LOV layout (keyed by Column.key). */
  cells?: Record<string, string | number | null | undefined>;
};

/**
 * Oracle-Forms style full-page FINDING list for a flat master (parties,
 * accounts, etc.). Opens a modal with a search box and a Code / Description
 * table. Click a row (or Enter on a single match) to pick.
 *
 * Pass `columns` for a rich multi-column LOV (contract lists that mirror the
 * Oracle grid: date, party, quality, rate, qty, status…). Each row supplies
 * the column values in `cells`. Without `columns` it renders the classic
 * Code / Description / [Extra] table.
 *
 * Stores `value` in a hidden input `name` and dispatches input/change/
 * combobox:change so downstream auto-fills (e.g. PartyCountGrid) react.
 */
export function FindingPicker({
  name,
  defaultValue,
  rows,
  title = "FINDING LIST",
  placeholder = "Select",
  className = "input-box mono cursor-pointer",
  extraLabel,
  filterByField,
  columns,
}: {
  name: string;
  defaultValue: string;
  rows: Row[];
  title?: string;
  placeholder?: string;
  className?: string;
  extraLabel?: string;
  /** Name of another field whose value must equal a row's filterKey for it to show (empty other-field = show all). */
  filterByField?: string;
  /** Optional Oracle-style columns; when set, the table renders these instead of Code/Description/[Extra]. */
  columns?: Column[];
}) {
  const [value, setValue] = useState(defaultValue || "");
  // Same as the quality picker: a server re-render after save does not remount
  // this, so state seeded once at mount would stay stale.
  const [lastDefault, setLastDefault] = useState(defaultValue);
  if (defaultValue !== lastDefault) {
    setLastDefault(defaultValue);
    setValue(defaultValue || "");
  }

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filterVal, setFilterVal] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  // Instance-scoped refs so multiple pickers with the SAME name (e.g. one per
  // grid row) stay independent — F9 opens only the focused one, and picking
  // writes to this row's own hidden input, not the first match in the DOM.
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); return; }
      if (e.key !== "F9") return;
      // Only respond if the focus is inside THIS instance (or its modal is open).
      const insideMe = !!active && !!containerRef.current && containerRef.current.contains(active);
      if (insideMe || open) { e.preventDefault(); setOpen((s) => !s); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Track the party (or other) field this picker is scoped to.
  useEffect(() => {
    if (!filterByField) return;
    const read = () => setFilterVal((document.querySelector<HTMLInputElement>(`[name="${filterByField}"]`)?.value ?? "").trim());
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      const d = (e as CustomEvent).detail as { value?: string; name?: string } | undefined;
      if ((t?.name ?? d?.name) === filterByField) setFilterVal((d?.value ?? t?.value ?? "").trim());
    };
    read();
    document.addEventListener("input", onChange, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("combobox:change", onChange, true);
    return () => {
      document.removeEventListener("input", onChange, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("combobox:change", onChange, true);
    };
  }, [filterByField]);

  // The hidden input is controlled by `value`, so a programmatic write to it — a
  // loom pick clearing a beam row, a row erase — only moves the DOM and snaps back
  // on the next render. Follow those writes into state. Scoped to THIS instance's
  // own input, so one row's fill never touches another row's picker.
  useEffect(() => {
    const el = hiddenRef.current;
    if (!el) return;
    const sync = () => setValue(el.value ?? "");
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
    return () => {
      el.removeEventListener("input", sync);
      el.removeEventListener("change", sync);
    };
  }, []);

  // Accept a value pushed in by an AutoFill (combobox:set), so a FindingPicker can
  // be an auto-fill target just like a Combobox (e.g. Sal Cont # echoing into Grey Sale Cont).
  useEffect(() => {
    const onSet = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string } | undefined;
      if (d?.name !== name) return;
      const v = d?.value ?? "";
      setValue(v);
      const hidden = hiddenRef.current;
      if (hidden) hidden.value = v;
    };
    document.addEventListener("combobox:set", onSet);
    return () => document.removeEventListener("combobox:set", onSet);
  }, [name]);

  const filtered = useMemo(() => {
    const scoped = filterByField && filterVal ? rows.filter((r) => !r.filterKey || r.filterKey === filterVal) : rows;
    const qL = q.trim().toLowerCase();
    if (!qL) return scoped;
    return scoped.filter((r) => {
      const cellText = r.cells ? Object.values(r.cells).map((v) => v ?? "").join(" ") : "";
      return `${r.code} ${r.description} ${r.extra ?? ""} ${cellText}`.toLowerCase().includes(qL);
    });
  }, [rows, q, filterByField, filterVal]);

  useEffect(() => { setFocusIdx(-1); }, [q, open]);

  useEffect(() => {
    if (focusIdx < 0) return;
    const row = tbodyRef.current?.children[focusIdx] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [focusIdx]);

  const pickRow = (v: string) => {
    setValue(v);
    setOpen(false);
    const hidden = hiddenRef.current;
    if (hidden) {
      hidden.value = v;
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
      hidden.dispatchEvent(new CustomEvent("combobox:change", { bubbles: true, detail: { value: v, name } }));
    }
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (focusIdx >= 0 && focusIdx < filtered.length) pickRow(filtered[focusIdx].value);
      else if (filtered.length === 1) pickRow(filtered[0].value);
    }
  };

  const selected = rows.find((r) => r.value === value);

  return (
    <div className="relative" ref={containerRef} data-finding-picker={name}>
      <input ref={hiddenRef} type="hidden" name={name} value={value} readOnly />
      <div className="flex gap-1 items-center">
        <input
          readOnly
          data-lov-picker
          className={className}
          // In a narrow grid cell the flex row used to crush this box down to a
          // few pixels, leaving only the ✕ and F9 buttons visible. min-width:0
          // lets it shrink below its content instead of fighting the buttons,
          // and flex:1 makes it take whatever the cell actually has.
          style={{ flex: "1 1 auto", minWidth: 0 }}
          // Name only. The client reads these boxes at a glance and the account
          // code in front of the name was just noise — the code is still on the
          // row in the finding list and in its footer.
          value={selected ? selected.description || selected.code : value}
          placeholder={placeholder}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        />
        {/* The display is readOnly and a click opens the list, so there was no
            way at all to take a pick back — on a phone there is not even a
            Delete key to reach for. Only shown once something is picked. */}
        {value ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => pickRow("")}
            title="Clear this selection"
            aria-label="Clear selection"
            style={{ padding: "0 8px", fontSize: 12, color: "var(--danger)", flex: "0 0 auto" }}
          >
            ✕
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setOpen(true)}
          title="Open finding list (F9)"
          style={{ padding: "0 8px", fontSize: 11, flex: "0 0 auto" }}
        >
          F9
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8" style={{ background: "rgba(15,23,42,0.6)" }} onClick={() => setOpen(false)}>
          <div
            className="border-2 border-black bg-white"
            style={{ width: columns ? "min(1040px, 97vw)" : "min(760px, 96vw)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-black px-4 py-2 flex items-center justify-between" style={{ background: "#0f172a", color: "white" }}>
              <span className="mono text-[12px] font-bold tracking-wide">{title}</span>
              <button type="button" onClick={() => setOpen(false)} className="text-white hover:opacity-70" style={{ padding: "0 4px" }}>✕</button>
            </div>

            <div className="border-b border-black px-4 py-3 bg-gray-50 flex items-end gap-3">
              <div className="flex-1">
                <label className="label block mb-1">Find</label>
                <input
                  autoFocus
                  className="input-box mono w-full"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder="Type code or description…"
                />
              </div>
              {q && <button type="button" className="btn btn-outline btn-sm" onClick={() => setQ("")} style={{ padding: "4px 10px" }}>Clear</button>}
              <div className="mono text-[11px] text-[var(--muted)] pb-2">{filtered.length} of {rows.length}</div>
            </div>

            <div className="overflow-auto" style={{ flex: 1 }}>
              <table className="w-full text-[12px] mono">
                <thead className="sticky top-0 bg-white border-b-2 border-black">
                  {columns ? (
                    <tr>
                      {columns.map((c) => (
                        <th
                          key={c.key}
                          className={`px-2 py-1 border-b border-black ${c.align === "right" ? "text-right" : "text-left"}`}
                          style={c.width ? { width: c.width } : undefined}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-2 py-1 text-left border-b border-black" style={{ width: 160 }}>Code</th>
                      <th className="px-2 py-1 text-left border-b border-black">Description</th>
                      {extraLabel && <th className="px-2 py-1 text-left border-b border-black" style={{ width: 120 }}>{extraLabel}</th>}
                    </tr>
                  )}
                </thead>
                <tbody ref={tbodyRef}>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={columns ? columns.length : extraLabel ? 3 : 2} className="px-4 py-8 text-center text-[var(--muted)] italic">
                        {filterByField && filterVal && rows.length > 0
                          ? `No records match the current scope ("${filterVal}") — clear the ${filterByField} field to see all ${rows.length}`
                          : "No matches"}
                      </td>
                    </tr>
                  ) : filtered.map((r, ri) => (
                    <tr
                      key={r.value}
                      className="border-b border-[var(--border-light)] cursor-pointer hover:bg-yellow-50"
                      onClick={() => pickRow(r.value)}
                      style={ri === focusIdx ? { background: "#1e40af", color: "white" } : value === r.value ? { background: "#0f172a", color: "white" } : undefined}
                    >
                      {columns ? (
                        columns.map((c, ci) => (
                          <td
                            key={c.key}
                            className={`px-2 py-1 ${c.align === "right" ? "text-right" : "text-left"} ${ci === 0 ? "font-bold" : ""}`}
                          >
                            {r.cells?.[c.key] ?? ""}
                          </td>
                        ))
                      ) : (
                        <>
                          <td className="px-2 py-1 font-bold">{r.code}</td>
                          <td className="px-2 py-1">{r.description}</td>
                          {extraLabel && <td className="px-2 py-1">{r.extra ?? ""}</td>}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-black px-4 py-2 text-[10px] text-[var(--muted)] mono flex justify-between">
              <span>Arrow keys to move · Enter to pick · Esc to close</span>
              <span>{selected ? `Current: ${selected.code}` : "None selected"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
