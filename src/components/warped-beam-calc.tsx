"use client";

import { useEffect } from "react";

const val = (el: HTMLInputElement | null | undefined) => {
  const n = parseFloat(el?.value ?? "");
  return Number.isFinite(n) ? n : 0;
};

const set = (el: HTMLInputElement | null, v: number) => {
  if (el) el.value = String(Math.round(v * 100) / 100);
};

export function WarpedBeamCalc() {
  useEffect(() => {
    const form = document.getElementById("iwb-save-form") as HTMLFormElement | null;
    if (!form) return;
    const q = (name: string) =>
      form.querySelector<HTMLInputElement>(`[name="${name}"]`);

    const recalc = () => {
      const sizingRate = val(q("sizingRate"));
      const rc = val(q("resultCountSzg")); // Result Count SZG (header)
      let amountSum = 0;
      let lengthSum = 0;
      form.querySelectorAll("tbody tr").forEach((tr) => {
        const beamNo = tr.querySelector<HTMLInputElement>('[name="beamNo"]');
        const bl = tr.querySelector<HTMLInputElement>('[name="beamLength"]');
        const rate = tr.querySelector<HTMLInputElement>('[name="rate"]');
        const ends = tr.querySelector<HTMLInputElement>('[name="ends"]');
        const conv = tr.querySelector<HTMLInputElement>('[name="conv"]');
        const amount = tr.querySelector<HTMLInputElement>('[name="amount"]');
        const hasRow = !!(beamNo?.value || (bl && bl.value));
        // Sizing rate entered up top flows into each populated row's Rate.
        if (sizingRate > 0 && hasRow) {
          if (rate) rate.value = String(sizingRate);
          if (conv && !conv.value) conv.value = String(sizingRate);
        }
        // Amount = Beam Length × Ends (tar) ÷ 1693.20 ÷ Result Count × Rate.
        // Rate = the row's own Rate when typed, else the header Sizing Rate.
        if (amount && bl?.value && ends?.value && rc > 0) {
          const r = val(rate) || sizingRate;
          set(amount, (val(bl) * val(ends)) / 1693.2 / rc * r);
        }
        amountSum += val(amount);
        lengthSum += val(bl);
      });
      set(q("totalAmount"), amountSum + val(q("freightCharges")));
      set(q("total_length_disp"), lengthSum);
      set(q("total_amount_disp"), amountSum);

      // Kgs is per-bag / per-cone weight: multiply by Qty (blank Qty = weight already a total).
      const bagConeWt =
        (val(q("bagsQty")) || 1) * val(q("bagsWeight")) +
        (val(q("conesQty")) || 1) * val(q("conesWeight"));
      const packWt =
        val(q("gulleyWeight")) +
        val(q("emtBagWeight")) +
        val(q("shoperWeight")) +
        val(q("wasteWeight")) +
        val(q("gattaWeight")) +
        val(q("headConeKgs"));
      const netWt = bagConeWt - packWt;
      set(q("netWeightDisp"), netWt);
      const amount = netWt * val(q("netWeightRate"));
      set(q("totalAmountFinal"), amount);
      set(q("amtTot"), amount * (1 + val(q("gstFtx")) / 100));
    };

    recalc();
    form.addEventListener("input", recalc);
    form.addEventListener("change", recalc);
    return () => {
      form.removeEventListener("input", recalc);
      form.removeEventListener("change", recalc);
    };
  }, []);
  return null;
}
