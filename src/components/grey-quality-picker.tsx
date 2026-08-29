"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  code: string;
  reed: number | null;
  pick: number | null;
  width: number | null;
  description: string;
  warpCounts: string[];
  weftCounts: string[];
  status: string;
};

/**
 * Oracle-Forms style FINDING GREY QUALITY picker.
 * Opens a modal with Read + Pick + free-text filters and a table of
 * matching constructions. Click a row to pick.
 *
 * Emits `combobox:change` on the hidden input so downstream <AutoFill> +
 * <GreyInfoPanel> pick up the selection.
 */
export function GreyQualityPicker({
  name,
  defaultValue,
  rows,
  countLabels,
  placeholder = "Select construction",
  className = "input-box mono cursor-pointer",
}: {
  name: string;
  defaultValue: string;
  rows: Row[];
  /** Optional map (lowercased count code → "code — blend") to show blend in the Warp/Weft columns. */
  countLabels?: Record<string, string>;
  placeholder?: string;
  className?: string;
}) {
  const label = (v: string) => {
    const t = (v ?? "").trim();
    if (!t) return "";
    return countLabels?.[t.toLowerCase()] ?? t;
  };
  const [value, setValue] = useState(defaultValue || "");
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState("");
  const [pick, setPick] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); return; }
      if (e.key !== "F9") return;
      const named = active?.getAttribute?.("name") === name;
      const insideMe = active?.closest?.(`[data-quality-picker="${name}"]`);
      if (named || insideMe || open) { e.preventDefault(); setOpen((s) => !s); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, name]);

  const filtered = useMemo(() => {
    const rN = read ? parseFloat(read) : null;
    const pN = pick ? parseFloat(pick) : null;
    const qL = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (rN !== null && r.reed !== rN) return false;
      if (pN !== null && r.pick !== pN) return false;
      if (qL) {
        const hay = [
          r.code, r.description,
          ...r.warpCounts, ...r.weftCounts,
        ].join(" ").toLowerCase();
        if (!hay.includes(qL)) return false;
      }
      return true;
    });
  }, [rows, read, pick, q]);

  const pickRow = (code: string) => {
    setValue(code);
    setOpen(false);
    // Notify combobox listeners (AutoFill, GreyInfoPanel)
    const hidden = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (hidden) {
      hidden.value = code;
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
      hidden.dispatchEvent(new CustomEvent("combobox:change", { bubbles: true, detail: { value: code, name } }));
    }
  };

  const selected = rows.find((r) => r.code === value);

  return (
    <div className="relative" data-quality-picker={name}>
      <input type="hidden" name={name} value={value} readOnly />
      <div className="flex gap-1">
        <input
          readOnly
          className={className}
          value={selected ? `${selected.code} — R${selected.reed ?? "-"} P${selected.pick ?? "-"}${selected.width ? ` · ${selected.width}"` : ""} · ${selected.description}` : value}
          placeholder={placeholder}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setOpen(true)}
          title="Open picker (F9)"
          style={{ padding: "0 8px", fontSize: 11 }}
        >
          F9
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8" style={{ background: "rgba(15,23,42,0.6)" }} onClick={() => setOpen(false)}>
          <div
            className="border-2 border-black bg-white"
            style={{ width: "min(1100px, 96vw)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-black px-4 py-2 flex items-center justify-between" style={{ background: "#0f172a", color: "white" }}>
              <span className="mono text-[12px] font-bold tracking-wide">FINDING GREY QUALITY (WVG)</span>
              <button type="button" onClick={() => setOpen(false)} className="text-white hover:opacity-70" style={{ padding: "0 4px" }}>✕</button>
            </div>

            {/* Filters */}
            <div className="border-b border-black px-4 py-3 bg-gray-50">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="label block mb-1">Read</label>
                  <input
                    type="number" step="any" autoFocus
                    className="input-box mono text-right" style={{ width: 90 }}
                    value={read} onChange={(e) => setRead(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && filtered.length === 1) pickRow(filtered[0].code); }}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Pick</label>
                  <input
                    type="number" step="any"
                    className="input-box mono text-right" style={{ width: 90 }}
                    value={pick} onChange={(e) => setPick(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && filtered.length === 1) pickRow(filtered[0].code); }}
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="label block mb-1">Search (code, desc, warp, weft)</label>
                  <input
                    className="input-box mono w-full"
                    value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="e.g. 20/S, MVS, poplin, GC-002"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setRead(""); setPick(""); setQ(""); }}
                  style={{ padding: "4px 10px" }}
                >
                  Clear
                </button>
                <div className="mono text-[11px] text-[var(--muted)]">
                  {filtered.length} of {rows.length}
                </div>
              </div>
            </div>

            {/* Results table */}
            <div className="overflow-auto" style={{ flex: 1 }}>
              <table className="w-full text-[12px] mono">
                <thead className="sticky top-0 bg-white border-b-2 border-black">
                  <tr>
                    <th className="px-2 py-1 text-right border-b border-black" style={{ width: 70 }}>Read</th>
                    <th className="px-2 py-1 text-right border-b border-black" style={{ width: 70 }}>Pick</th>
                    <th className="px-2 py-1 text-left border-b border-black" style={{ width: 100 }}>Code</th>
                    <th className="px-2 py-1 text-left border-b border-black">Warp</th>
                    <th className="px-2 py-1 text-left border-b border-black">Weft</th>
                    <th className="px-2 py-1 text-center border-b border-black" style={{ width: 60 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)] italic">No matches</td></tr>
                  ) : filtered.map((r) => (
                    <tr
                      key={r.code}
                      className="border-b border-[var(--border-light)] cursor-pointer hover:bg-yellow-50"
                      onClick={() => pickRow(r.code)}
                      style={value === r.code ? { background: "#0f172a", color: "white" } : undefined}
                    >
                      <td className="px-2 py-1 text-right">{r.reed ?? "-"}</td>
                      <td className="px-2 py-1 text-right">{r.pick ?? "-"}</td>
                      <td className="px-2 py-1 font-bold">{r.code}</td>
                      <td className="px-2 py-1">{r.warpCounts.filter(Boolean).map(label).join(" · ") || "-"}</td>
                      <td className="px-2 py-1">{r.weftCounts.filter(Boolean).map(label).join(" · ") || "-"}</td>
                      <td className="px-2 py-1 text-center">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-black px-4 py-2 text-[10px] text-[var(--muted)] mono flex justify-between">
              <span>Click a row to pick · Esc to close · Enter picks single result</span>
              <span>{selected ? `Current: ${selected.code}` : "None selected"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
