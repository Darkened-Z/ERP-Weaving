"use client";

import { useEffect, useRef, useState } from "react";

/**
 * F9-triggered status picker with a set of "canonical" statuses shown
 * prominently and any additional statuses shown as sub-states.
 *
 * Beam has TWO status fields:
 *   status_wrk — physical state: EMPTY / LOADED / RUNNING / CLOSE
 *   status_loc — conversion-contract lifecycle: RUNNING / F-ROLL / L-ROLL /
 *                R-CUT / RE-KNOT / EMPTY (end state)
 */
export const STATUS_WRK_CANONICAL: Array<{ status: string; label: string; hint: string; color: string }> = [
  { status: "EMPTY",   label: "EMPTY",   hint: "No beam on loom / last roll cut",       color: "#64748b" },
  { status: "LOADED",  label: "LOADED",  hint: "Warp beam received from external party", color: "#0891b2" },
  { status: "RUNNING", label: "RUNNING", hint: "Mounted on loom — weaving in progress",  color: "#059669" },
  { status: "CLOSE",   label: "CLOSE",   hint: "Set completed and archived",             color: "#64748b" },
];

export const STATUS_LOC_CANONICAL: Array<{ status: string; label: string; hint: string; color: string }> = [
  { status: "RUNNING", label: "RUNNING", hint: "Beam running under conversion contract", color: "#059669" },
  { status: "F-ROLL",  label: "F-ROLL",  hint: "First roll produced",                    color: "#0891b2" },
  { status: "L-ROLL",  label: "L-ROLL",  hint: "Last roll produced",                     color: "#f59e0b" },
  { status: "R-CUT",   label: "R-CUT",   hint: "Roll cut / re-cut",                      color: "#f59e0b" },
  { status: "RE-KNOT", label: "RE-KNOT", hint: "Re-knotting in progress",                color: "#f59e0b" },
  { status: "EMPTY",   label: "EMPTY",   hint: "End state — beam finished",              color: "#64748b" },
];

export function BeamStatusPicker({
  name,
  defaultValue,
  allStatuses,
  canonical = STATUS_WRK_CANONICAL,
}: {
  name: string;
  defaultValue: string;
  allStatuses: Array<{ id: number; status: string }>;
  canonical?: Array<{ status: string; label: string; hint: string; color: string }>;
}) {
  const [value, setValue] = useState(defaultValue || "EMPTY");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        const active = document.activeElement as HTMLElement | null;
        const named = active?.getAttribute?.("name") === name;
        const insideMe = active?.closest?.(`[data-status-picker="${name}"]`);
        if (named || insideMe || open) {
          e.preventDefault();
          setOpen((s) => !s);
        }
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, name]);

  const canonicalStatuses = new Set(canonical.map((c) => c.status));
  const subStatuses = allStatuses.filter((s) => !canonicalStatuses.has(s.status));
  const currentDef = canonical.find((c) => c.status === value);

  return (
    <div className="relative" data-status-picker={name}>
      <input type="hidden" name={name} value={value} />
      <div className="flex gap-1">
        <input
          ref={inputRef}
          readOnly
          className="input-box mono cursor-pointer"
          value={value}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          title={currentDef?.hint ?? "Press F9 to pick"}
          style={{ borderLeft: currentDef ? `3px solid ${currentDef.color}` : undefined }}
        />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setOpen(true)}
          title="Open beam status picker (F9)"
          style={{ padding: "0 8px", fontSize: 11 }}
        >
          F9
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.6)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="border-2 border-black bg-white"
            style={{ width: "min(520px, 92vw)", maxHeight: "80vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-black px-4 py-2 flex items-center justify-between" style={{ background: "#0f172a", color: "white" }}>
              <span className="mono text-[12px] font-bold tracking-wide">BEAM STATUS · Pick one</span>
              <button type="button" onClick={() => setOpen(false)} className="text-white hover:opacity-70" style={{ padding: "0 4px" }}>✕</button>
            </div>

            <div className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2 mono">Canonical states</div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {canonical.map((c) => (
                  <button
                    key={c.status}
                    type="button"
                    onClick={() => { setValue(c.status); setOpen(false); inputRef.current?.focus(); }}
                    className="border-2 border-black p-2 text-left hover:bg-gray-100"
                    style={value === c.status ? { background: c.color, color: "white" } : undefined}
                  >
                    <div className="mono text-[13px] font-bold">{c.label}</div>
                    <div className="text-[10px] mt-1" style={value === c.status ? { color: "white" } : { color: "var(--muted)" }}>{c.hint}</div>
                  </button>
                ))}
              </div>

              {subStatuses.length > 0 && (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2 mono">Sub-states (advanced)</div>
                  <div className="flex flex-wrap gap-1">
                    {subStatuses.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setValue(s.status); setOpen(false); inputRef.current?.focus(); }}
                        className="border border-black px-2 py-1 mono text-[11px] hover:bg-gray-100"
                        style={value === s.status ? { background: "black", color: "white" } : undefined}
                      >
                        {s.status}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
