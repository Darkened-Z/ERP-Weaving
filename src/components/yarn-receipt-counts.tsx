"use client";

import { useEffect } from "react";

/**
 * Count-detail live math for Yarn Receipt/Return:
 *   - Bags = Warp Bags + Weft Bags (total)
 *   - Qty Lbs = Bags × 100 (auto, but stays editable — only fills when blank
 *     or still holding the last auto value, so a typed override survives)
 *   - Rate / Lbs mirrors Rate / Lbs To (the delivered-to rate)
 */
export function YarnReceiptCounts() {
  useEffect(() => {
    const q = (name: string) =>
      document.querySelector<HTMLInputElement>(`#iyr-save-form [name="${name}"]`);
    const warp = q("warp");
    const weft = q("weft");
    const bags = q("bags");
    const qtyLbs = q("qtyLbs");
    const rateTo = q("ratePerLbsTo");
    const rate = q("ratePerLbs");

    let lastAutoLbs = "";

    const numv = (el: HTMLInputElement | null) => {
      const n = parseFloat(el?.value ?? "");
      return Number.isFinite(n) ? n : 0;
    };

    const recalcBags = () => {
      if (!bags) return;
      const total = numv(warp) + numv(weft);
      bags.value = total ? String(Math.round(total * 100) / 100) : "";
      bags.dispatchEvent(new Event("input", { bubbles: true }));
      recalcLbs();
    };
    const recalcLbs = () => {
      if (!qtyLbs) return;
      const b = numv(bags);
      // Fill only if the field is empty or still shows the previous auto value.
      if (qtyLbs.value === "" || qtyLbs.value === lastAutoLbs) {
        lastAutoLbs = b ? String(Math.round(b * 100 * 100) / 100) : "";
        qtyLbs.value = lastAutoLbs;
        qtyLbs.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    const mirrorRate = () => {
      if (!rate || !rateTo) return;
      rate.value = rateTo.value;
      rate.dispatchEvent(new Event("input", { bubbles: true }));
    };

    warp?.addEventListener("input", recalcBags);
    weft?.addEventListener("input", recalcBags);
    rateTo?.addEventListener("input", mirrorRate);
    rateTo?.addEventListener("change", mirrorRate);
    return () => {
      warp?.removeEventListener("input", recalcBags);
      weft?.removeEventListener("input", recalcBags);
      rateTo?.removeEventListener("input", mirrorRate);
      rateTo?.removeEventListener("change", mirrorRate);
    };
  }, []);
  return null;
}
