"use client";

import { useEffect, useState } from "react";

type CountEntry = { calWarp: number | null; calWeft: number | null; rate: number | null };
type PartyData = { counts: Array<{ code: string; label: string }>; byCount: Record<string, CountEntry> };

/**
 * F9 / Enter count picker for the grey-conversion WARP/WEFT grid.
 * When the operator is on any *_count_* input and presses F9 or Enter (or
 * clicks the field), a modal opens listing the SELECTED party's counts
 * (Cal Warp / Cal Weft / Rate). Picking a row fills that count cell and fires
 * events so PartyCountGrid + RowAutoFill populate Cal Count / Rate / Desc.
 *
 * Falls back to all counts when no party is selected.
 */
export function CountPicker({
  partyField = "party",
  partyCodeByDesc,
  partyCountData,
  allCounts,
  countFieldPattern = "^(warp|weft)_count_\\d+$",
}: {
  partyField?: string;
  partyCodeByDesc: Record<string, string>;
  partyCountData: Record<string, PartyData>;
  allCounts: Array<{ code: string; label: string }>;
  countFieldPattern?: string;
}) {
  const [open, setOpen] = useState(false);
  const [targetName, setTargetName] = useState<string>("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const re = new RegExp(countFieldPattern);
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLInputElement | null;
      if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); return; }
      const name = active?.getAttribute?.("name") ?? "";
      const isCount = re.test(name);
      if ((e.key === "F9" || e.key === "Enter") && isCount && !open) {
        e.preventDefault();
        setTargetName(name);
        setQ("");
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, countFieldPattern]);

  const partyDesc = () => (document.querySelector<HTMLInputElement>(`input[name="${partyField}"]`)?.value ?? "").trim();
  const currentData = () => {
    const code = partyCodeByDesc[partyDesc()];
    return code ? partyCountData[code] : undefined;
  };
  const data = currentData();
  const rows = data && data.counts.length ? data.counts : allCounts;
  const ql = q.trim().toLowerCase();
  const filtered = ql ? rows.filter((r) => r.label.toLowerCase().includes(ql)) : rows;

  const pick = (code: string) => {
    const el = document.querySelector<HTMLInputElement>(`input[name="${targetName}"]`);
    if (el) {
      el.value = code;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.focus();
    }
    setOpen(false);
  };

  const info = (code: string) => data?.byCount[code];

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10" style={{ background: "rgba(15,23,42,0.6)" }} onClick={() => setOpen(false)}>
      <div
        className="border-2 border-black bg-white"
        style={{ width: "min(680px, 96vw)", maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-black px-4 py-2 flex items-center justify-between" style={{ background: "#0f172a", color: "white" }}>
          <span className="mono text-[12px] font-bold tracking-wide">
            COUNT LIST {partyDesc() ? `· ${partyDesc()}` : "· (all — no party selected)"}
          </span>
          <button type="button" onClick={() => setOpen(false)} className="text-white hover:opacity-70" style={{ padding: "0 4px" }}>✕</button>
        </div>
        <div className="border-b border-black px-4 py-3 bg-gray-50 flex items-end gap-3">
          <div className="flex-1">
            <label className="label block mb-1">Find count</label>
            <input
              autoFocus
              className="input-box mono w-full"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && filtered.length === 1) pick(filtered[0].code); }}
              placeholder="code or description…"
            />
          </div>
          <div className="mono text-[11px] text-[var(--muted)] pb-2">{filtered.length} of {rows.length}</div>
        </div>
        <div className="overflow-auto" style={{ flex: 1 }}>
          <table className="w-full text-[12px] mono">
            <thead className="sticky top-0 bg-white border-b-2 border-black">
              <tr>
                <th className="px-2 py-1 text-left border-b border-black">Count Desc</th>
                <th className="px-2 py-1 text-right border-b border-black" style={{ width: 90 }}>Cal Warp</th>
                <th className="px-2 py-1 text-right border-b border-black" style={{ width: 90 }}>Cal Weft</th>
                <th className="px-2 py-1 text-right border-b border-black" style={{ width: 90 }}>Rate/Lbs</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)] italic">No counts{partyDesc() ? " for this party — add them in Party Counts" : ""}</td></tr>
              ) : filtered.map((r) => {
                const i = info(r.code);
                return (
                  <tr key={r.code} className="border-b border-[var(--border-light)] cursor-pointer hover:bg-yellow-50" onClick={() => pick(r.code)}>
                    <td className="px-2 py-1">{r.label}</td>
                    <td className="px-2 py-1 text-right">{i?.calWarp ?? "-"}</td>
                    <td className="px-2 py-1 text-right">{i?.calWeft ?? "-"}</td>
                    <td className="px-2 py-1 text-right">{i?.rate ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-black px-4 py-2 text-[10px] text-[var(--muted)] mono">
          F9 / Enter on a Count cell opens this · click a row to pick · Esc to close
        </div>
      </div>
    </div>
  );
}
