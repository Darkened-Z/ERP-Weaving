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
      const sizingRateKg = val(q("sizingRateKg"));
      const rc = val(q("resultCountSzg"));
      const rcMul = rc > 0 ? rc : 1;
      let amountSum = 0;
      let lengthSum = 0;
      form.querySelectorAll("tbody tr").forEach((tr) => {
        const beamNo = tr.querySelector<HTMLInputElement>('[name="beamNo"]');
        const bl = tr.querySelector<HTMLInputElement>('[name="beamLength"]');
        const ends = tr.querySelector<HTMLInputElement>('[name="ends"]');
        const conv = tr.querySelector<HTMLInputElement>('[name="conv"]');
        const rateKgLine = tr.querySelector<HTMLInputElement>('[name="rateKgLine"]');
        const amount = tr.querySelector<HTMLInputElement>('[name="amount"]');
        const hasRow = !!(beamNo?.value || (bl && bl.value));
        if (hasRow) {
          if (conv) conv.value = sizingRate > 0 ? String(sizingRate) : "";
          if (rateKgLine) rateKgLine.value = sizingRateKg > 0 ? String(sizingRateKg) : "";
        }
        if (amount) {
          if (bl?.value && ends?.value && sizingRate > 0) {
            set(amount, (val(bl) * val(ends)) / 1693.2 * rcMul * sizingRate);
          } else if (hasRow && sizingRate <= 0) {
            amount.value = "";
          }
        }
        amountSum += val(amount);
        lengthSum += val(bl);
      });
      set(q("totalAmount"), amountSum + val(q("freightCharges")));
      set(q("total_length_disp"), lengthSum);
      set(q("total_amount_disp"), amountSum);

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
      const nwrEl = q("netWeightRate");
      if (nwrEl && sizingRateKg > 0) nwrEl.value = String(sizingRateKg);
      const amount = netWt * val(nwrEl);
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
