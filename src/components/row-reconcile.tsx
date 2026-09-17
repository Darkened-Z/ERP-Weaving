"use client";

import { useEffect } from "react";

type Fill = Record<string, string | number>;

/**
 * Reconcile each saved grid row to its Party Count on load.
 *
 * A line stores the party count, the yarn count and the count description as
 * three separate columns, written at different moments. A row saved while they
 * were out of step keeps disagreeing for ever — party count 21 (36/s PV 90;10)
 * sitting next to count 1 and the description "60/S CTN" — because nothing
 * re-derives them once the row is on screen as default values.
 *
 * The Party Count is the authority: it is the count the party is actually set
 * up with, and picking one is what fills the other two in the first place. So
 * on mount every row that names one is brought back into line with it.
 *
 * Only fields the map carries are touched, and only where they actually differ,
 * so a rate the operator deliberately overrode on an in-progress row is left be.
 */
export function RowReconcileFromPartyCount({
  selectName,
  map,
  fields = ["line_count", "line_count_desc"],
}: {
  selectName: string;
  map: Record<string, Fill>;
  /** Which of the map's fields to reconcile. Rate is deliberately NOT here. */
  fields?: string[];
}) {
  useEffect(() => {
    for (const sel of document.querySelectorAll<HTMLSelectElement>(`[name="${selectName}"]`)) {
      const code = (sel.value ?? "").trim();
      if (!code) continue;
      const data = map[code];
      if (!data) continue;
      const row = sel.closest("tr");
      if (!row) continue;
      for (const f of fields) {
        const want = data[f];
        if (want == null) continue;
        const el = row.querySelector<HTMLInputElement>(`[name="${f}"]`);
        if (!el || el.value === String(want)) continue;
        el.value = String(want);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }, [selectName, map, fields]);
  return null;
}
