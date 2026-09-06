"use client";

import { useEffect } from "react";

/**
 * mm/Than serial with grade tag, per active count row: each active row gets the
 * next monthly number (3-digit, e.g. SEP-001-26) PLUS the grade whose meters are
 * filled in that row — "SEP-001-26|A", "SEP-002-26|B", … so every than shows
 * which voucher/grade it belongs to (client-approved format). `base` is the next
 * monthly number from the server. Only fills blank / auto cells (data-live); a
 * user-typed serial is kept, and the server regenerates blanks on save.
 */
const GRADES: { grade: string; field: string }[] = [
  { grade: "A", field: "aCount" },
  { grade: "B", field: "bCount" },
  { grade: "C", field: "cCount" },
  { grade: "CP", field: "cpCount" },
  { grade: "PPC", field: "ppcCount" },
];

function gradeOf(tr: HTMLTableRowElement): string {
  for (const g of GRADES) {
    const el = tr.querySelector<HTMLInputElement>(`[name="${g.field}"]`);
    const n = parseFloat(el?.value ?? "");
    if (Number.isFinite(n) && n > 0) return g.grade;
  }
  return "";
}

export function ThanSerialLive({ base, prefix, suffix }: { base: number; prefix: string; suffix: string }) {
  useEffect(() => {
    // A direct edit of a than cell releases it from auto-management.
    const onEdit = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t && t.name === "mmThanSrNo") delete t.dataset.live;
    };

    const recompute = () => {
      const rows = Array.from(document.querySelectorAll("#idp-count-rows tr")) as HTMLTableRowElement[];
      let idx = 0;
      rows.forEach((tr) => {
        const than = tr.querySelector('[name="mmThanSrNo"]') as HTMLInputElement | null;
        if (!than) return;
        const grade = gradeOf(tr);
        const active = !!grade || !!than.value;
        if (active) {
          if (than.dataset.live === "1" || !than.value) {
            const seq = String(base + idx).padStart(3, "0");
            than.value = grade ? `${prefix}${seq}${suffix}|${grade}` : `${prefix}${seq}${suffix}`;
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
