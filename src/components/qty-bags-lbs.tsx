"use client";

import { useEffect } from "react";

/**
 * Qty Lbs = Qty Bags × 100 (the standard bag = 100 lbs). Fills only while the Lbs
 * field is blank or still holds the last auto value, so a typed override survives.
 * Scoped to the form with id `formId`, using the field names `bags` and `lbs`.
 */
export function QtyBagsLbs({ formId, bags = "qtyBags", lbs = "qtyLbs" }: { formId: string; bags?: string; lbs?: string }) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    const bagsEl = form.querySelector<HTMLInputElement>(`[name="${bags}"]`);
    const lbsEl = form.querySelector<HTMLInputElement>(`[name="${lbs}"]`);
    if (!bagsEl || !lbsEl) return;
    let lastAuto = "";
    const recalc = () => {
      const b = parseFloat(bagsEl.value);
      if (lbsEl.value === "" || lbsEl.value === lastAuto) {
        lastAuto = Number.isFinite(b) && b !== 0 ? String(Math.round(b * 100 * 100) / 100) : "";
        lbsEl.value = lastAuto;
        lbsEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    bagsEl.addEventListener("input", recalc);
    return () => bagsEl.removeEventListener("input", recalc);
  }, [formId, bags, lbs]);
  return null;
}
