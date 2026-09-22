"use client";

import { useEffect } from "react";

/**
 * Show only the grid rows that are in use, plus one waiting empty row.
 *
 * A voucher that needs two lines should not open with twenty blank ones — the
 * operator scrolls past a page of nothing to reach the totals, and on a phone
 * the form is mostly empty boxes. The rows all exist in the DOM so the form
 * arrays stay index-aligned and the server still ignores empty lines; the ones
 * that are not needed yet are simply not shown, and the next one appears as
 * soon as the last visible row is typed in.
 */
export function GrowRows({
  tbodyId,
  initial = 2,
}: {
  tbodyId: string;
  /** How many rows to show on a blank form. */
  initial?: number;
}) {
  useEffect(() => {
    const body = document.getElementById(tbodyId) as HTMLTableSectionElement | null;
    if (!body) return;

    const filled = (tr: HTMLTableRowElement) =>
      Array.from(tr.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")).some(
        (el) => {
          if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "button")) return false;
          return (el.value ?? "").trim() !== "";
        },
      );

    const apply = () => {
      const rows = Array.from(body.rows);
      let lastUsed = -1;
      rows.forEach((tr, i) => {
        if (filled(tr)) lastUsed = i;
      });
      // One spare row after the last one in use, never fewer than `initial`.
      const show = Math.max(initial, lastUsed + 2);
      rows.forEach((tr, i) => {
        tr.style.display = i < show ? "" : "none";
      });
    };

    apply();
    const onChange = (e: Event) => {
      if (body.contains(e.target as Node)) apply();
    };
    document.addEventListener("input", onChange, true);
    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("input", onChange, true);
      document.removeEventListener("change", onChange, true);
    };
  }, [tbodyId, initial]);

  return null;
}
