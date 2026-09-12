"use client";

import { useEffect } from "react";
import { thanLetter } from "@/lib/than-serial";

const COUNT_FIELDS = ["aCount", "bCount", "cCount", "cpCount", "ppcCount", "rejCount"];

function hasMeters(tr: HTMLTableRowElement): boolean {
  return COUNT_FIELDS.some((f) => {
    const n = parseFloat(tr.querySelector<HTMLInputElement>(`[name="${f}"]`)?.value ?? "");
    return Number.isFinite(n) && n > 0;
  });
}

export function ThanSerialLive({ vNo }: { vNo: string }) {
  useEffect(() => {
    const onEdit = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t && t.name === "mmThanSrNo") {
        delete t.dataset.live;
        t.dataset.manual = "1";
      }
    };

    const recompute = () => {
      const rows = Array.from(document.querySelectorAll("#idp-count-rows tr")) as HTMLTableRowElement[];
      rows.forEach((tr, i) => {
        const than = tr.querySelector('[name="mmThanSrNo"]') as HTMLInputElement | null;
        if (!than) return;
        // Row 1 carries the voucher's own than, so it shows from the moment the
        // form opens. Later rows appear once they have meters of their own.
        const active = hasMeters(tr) || !!than.value || i === 0;
        if (active) {
          const want = `${vNo}/${thanLetter(i)}`;
          // A serial already in this voucher's own shape is machine-owned even
          // when it came back from the database, so a row that moved keeps a
          // serial matching its position. A hand-typed one is left alone.
          const owned =
            than.dataset.live === "1" ||
            !than.value ||
            (!than.dataset.manual && than.value.startsWith(`${vNo}/`));
          if (owned && than.value !== want) {
            than.value = want;
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
