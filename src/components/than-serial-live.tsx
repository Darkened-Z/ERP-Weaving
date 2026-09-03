"use client";

import { useEffect } from "react";

/**
 * Live mm/Than serial per production row: each active row (has a beam / loom /
 * count) gets the next serial (e.g. SEP-0133-26, SEP-0134-26…) as you add rows.
 * `base` is the next number for the current month (from the server). Only touches
 * blank / auto-assigned cells (marked data-live) — a user-typed serial is kept,
 * and the server still regenerates any blanks on save as a safety net.
 */
export function ThanSerialLive({ base, prefix, suffix }: { base: number; prefix: string; suffix: string }) {
  useEffect(() => {
    // A direct edit of a than cell releases it from auto-management.
    const onEdit = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t && t.name === "mmThanSrNo") delete t.dataset.live;
    };

    const recompute = () => {
      const rows = document.querySelectorAll("#idp-set-rows tr");
      let idx = 0;
      rows.forEach((tr) => {
        const than = tr.querySelector('[name="mmThanSrNo"]') as HTMLInputElement | null;
        if (!than) return;
        const q = (n: string) => (tr.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value?.trim();
        const active = !!(q("beamNo") || q("loomNo") || q("setHash") || q("aCount") || q("bCount") || q("cCount") || q("cpCount") || q("ppcCount") || q("ends"));
        const autoOwned = than.dataset.live === "1" || !than.value;
        if (active) {
          if (autoOwned) {
            than.value = `${prefix}${String(base + idx).padStart(4, "0")}${suffix}`;
            than.dataset.live = "1";
          }
          idx++;
        } else if (than.dataset.live === "1") {
          than.value = "";
          delete than.dataset.live;
        }
      });
    };

    const onEvt = () => setTimeout(recompute, 0);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);
    const t = setTimeout(recompute, 0);
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("input", onEvt, true);
      document.removeEventListener("change", onEvt, true);
      clearTimeout(t);
    };
  }, [base, prefix, suffix]);
  return null;
}
