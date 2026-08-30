"use client";

import { useState } from "react";

/**
 * Term picker: CASH or DUE. When DUE is chosen, a Days field and a Due-Date field
 * appear. Typing Days auto-computes Due Date = base voucher date + days (no calendar
 * picking needed); Due Date stays editable if the user wants to override.
 */
export function TermSelect({
  defaultTerm = "CASH",
  defaultDate = "",
  defaultDays = "",
  baseDateField = "v_date",
}: {
  defaultTerm?: string;
  defaultDate?: string;
  defaultDays?: string | number;
  baseDateField?: string;
}) {
  const [term, setTerm] = useState(defaultTerm === "DUE" ? "DUE" : "CASH");
  const [days, setDays] = useState<string>(defaultDays != null && defaultDays !== "" ? String(defaultDays) : "");
  const [due, setDue] = useState<string>(defaultDate ?? "");

  const computeDue = (d: string) => {
    const base = (document.querySelector(`[name="${baseDateField}"]`) as HTMLInputElement | null)?.value;
    const n = parseInt(d, 10);
    if (!base || !Number.isFinite(n)) return;
    const dt = new Date(base + "T00:00:00");
    if (Number.isNaN(dt.getTime())) return;
    dt.setDate(dt.getDate() + n);
    // Format from LOCAL components — toISOString() would shift a day in UTC+ zones (e.g. PKT).
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    setDue(iso);
  };

  return (
    <>
      <div className="lg:col-span-2">
        <label className="label block mb-1">Term</label>
        <select
          name="term"
          className="input-box mono"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        >
          <option value="CASH">CASH</option>
          <option value="DUE">DUE</option>
        </select>
      </div>
      {term === "DUE" && (
        <>
          <div className="lg:col-span-2">
            <label className="label block mb-1">Days</label>
            <input
              name="days"
              type="number"
              step="1"
              className="input-box mono text-right"
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                computeDue(e.target.value);
              }}
              placeholder="days"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="label block mb-1">
              Due Date <span className="text-[9px] text-[var(--muted)]">(auto)</span>
            </label>
            <input
              name="due_date"
              type="date"
              className="input-box mono"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
        </>
      )}
    </>
  );
}
