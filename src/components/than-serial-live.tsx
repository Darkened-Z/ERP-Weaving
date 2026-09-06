"use client";

import { useEffect } from "react";

/**
 * Voucher-matched mm/Than serial: ALL active count rows of one voucher share the
 * SAME serial (e.g. SEP-001-26 — the voucher's own monthly number), so the A/B/C
 * than boxes show which voucher each than belongs to. `base` is the next monthly
 * number from the server. Only fills blank / auto-assigned cells (data-live); a
 * user-typed serial is kept, and the server regenerates blanks on save.
 */
export function ThanSerialLive({ base, prefix, suffix }: { base: number; prefix: string; suffix: string }) {
  useEffect(() => {
    // A direct edit of a than cell releases it from auto-management.
    const onEdit = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t && t.name === "mmThanSrNo") delete t.dataset.live;
    };

    const recompute = () => {
      const rows = document.querySelectorAll("#idp-count-rows tr");
      const serial = `${prefix}${String(base).padStart(3, "0")}${suffix}`;
      rows.forEach((tr) => {
        const than = tr.querySelector('[name="mmThanSrNo"]') as HTMLInputElement | null;
        if (!than) return;
        const q = (n: string) => (tr.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value?.trim();
        const active = !!(q("aCount") || q("bCount") || q("cCount") || q("cpCount") || q("ppcCount") || than.value);
        if (active) {
          if (than.dataset.live === "1" || !than.value) {
            than.value = serial;
            than.dataset.live = "1";
          }
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
