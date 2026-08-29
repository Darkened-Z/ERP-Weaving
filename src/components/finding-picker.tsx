"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Row = { value: string; code: string; description: string; extra?: string };

/**
 * Oracle-Forms style full-page FINDING list for a flat master (parties,
 * accounts, etc.). Opens a modal with a search box and a Code / Description
 * table. Click a row (or Enter on a single match) to pick.
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
}: {
  name: string;
  defaultValue: string;
  rows: Row[];
  title?: string;
  placeholder?: string;
  className?: string;
  extraLabel?: string;
}) {
  const [value, setValue] = useState(defaultValue || "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
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

  const filtered = useMemo(() => {
    const qL = q.trim().toLowerCase();
    if (!qL) return rows;
    return rows.filter((r) => `${r.code} ${r.description} ${r.extra ?? ""}`.toLowerCase().includes(qL));
  }, [rows, q]);

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

  const selected = rows.find((r) => r.value === value);

  return (
    <div className="relative" ref={containerRef} data-finding-picker={name}>
      <input ref={hiddenRef} type="hidden" name={name} value={value} readOnly />
      <div className="flex gap-1">
        <input
          readOnly
          className={className}
          value={selected ? `${selected.code} — ${selected.description}` : value}
          placeholder={placeholder}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setOpen(true)}
          title="Open finding list (F9)"
          style={{ padding: "0 8px", fontSize: 11 }}
        >
          F9
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8" style={{ background: "rgba(15,23,42,0.6)" }} onClick={() => setOpen(false)}>
          <div
            className="border-2 border-black bg-white"
            style={{ width: "min(760px, 96vw)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
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
                  onKeyDown={(e) => { if (e.key === "Enter" && filtered.length === 1) pickRow(filtered[0].value); }}
                  placeholder="Type code or description…"
                />
              </div>
              {q && <button type="button" className="btn btn-outline btn-sm" onClick={() => setQ("")} style={{ padding: "4px 10px" }}>Clear</button>}
              <div className="mono text-[11px] text-[var(--muted)] pb-2">{filtered.length} of {rows.length}</div>
            </div>

            <div className="overflow-auto" style={{ flex: 1 }}>
              <table className="w-full text-[12px] mono">
                <thead className="sticky top-0 bg-white border-b-2 border-black">
                  <tr>
                    <th className="px-2 py-1 text-left border-b border-black" style={{ width: 160 }}>Code</th>
                    <th className="px-2 py-1 text-left border-b border-black">Description</th>
                    {extraLabel && <th className="px-2 py-1 text-left border-b border-black" style={{ width: 120 }}>{extraLabel}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={extraLabel ? 3 : 2} className="px-4 py-8 text-center text-[var(--muted)] italic">No matches</td></tr>
                  ) : filtered.map((r) => (
                    <tr
                      key={r.value}
                      className="border-b border-[var(--border-light)] cursor-pointer hover:bg-yellow-50"
                      onClick={() => pickRow(r.value)}
                      style={value === r.value ? { background: "#0f172a", color: "white" } : undefined}
                    >
                      <td className="px-2 py-1 font-bold">{r.code}</td>
                      <td className="px-2 py-1">{r.description}</td>
                      {extraLabel && <td className="px-2 py-1">{r.extra ?? ""}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-black px-4 py-2 text-[10px] text-[var(--muted)] mono flex justify-between">
              <span>Click a row to pick · Esc to close · Enter picks a single result</span>
              <span>{selected ? `Current: ${selected.code}` : "None selected"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
