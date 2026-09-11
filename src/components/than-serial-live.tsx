"use client";

import { useEffect } from "react";

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
  // Rejection alone → grade B (rejected cloth counted as B quality for serial)
  const rej = tr.querySelector<HTMLInputElement>('[name="rejCount"]');
  const rejVal = parseFloat(rej?.value ?? "");
  if (Number.isFinite(rejVal) && rejVal > 0) return "B";
  return "";
}

export function ThanSerialLive({ vNo }: { vNo: string }) {
  useEffect(() => {
    const onEdit = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t && t.name === "mmThanSrNo") delete t.dataset.live;
    };

    const recompute = () => {
      const rows = Array.from(document.querySelectorAll("#idp-count-rows tr")) as HTMLTableRowElement[];
      rows.forEach((tr) => {
        const than = tr.querySelector('[name="mmThanSrNo"]') as HTMLInputElement | null;
        if (!than) return;
        const grade = gradeOf(tr);
        const active = !!grade || !!than.value;
        if (active) {
          if (than.dataset.live === "1" || !than.value) {
            than.value = grade ? `${vNo}/${grade}` : vNo;
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
  }, [vNo]);
  return null;
}
