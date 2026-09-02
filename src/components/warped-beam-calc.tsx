"use client";

import { useEffect } from "react";

const KG_TO_LBS = 2.2046;

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
      let amountSum = 0;
      form.querySelectorAll("tbody tr").forEach((tr) => {
        const beamNo = tr.querySelector<HTMLInputElement>('[name="beamNo"]');
        const bl = tr.querySelector<HTMLInputElement>('[name="beamLength"]');
        const rate = tr.querySelector<HTMLInputElement>('[name="rate"]');
        const conv = tr.querySelector<HTMLInputElement>('[name="conv"]');
        const amount = tr.querySelector<HTMLInputElement>('[name="amount"]');
        const hasRow = !!(beamNo?.value || (bl && bl.value));
        // Sizing rate entered up top flows into each populated row: the visible rate
        // always, and conv (which drives amount) only if the row has none yet.
        if (sizingRate > 0 && hasRow) {
          if (rate) rate.value = String(sizingRate);
          if (conv && !conv.value) conv.value = String(sizingRate);
        }
        const loaded = tr.querySelector<HTMLInputElement>('[name="beamLoadedHnk"]');
        const net = tr.querySelector<HTMLInputElement>('[name="yarnBmsNetLbs"]');
        if (net && loaded?.value) {
          set(net, (val(loaded) - val(tr.querySelector<HTMLInputElement>('[name="emptyKg"]'))) * KG_TO_LBS);
        }
        if (amount && bl && bl.value && conv && conv.value) {
          set(amount, val(bl) * val(conv));
        }
        amountSum += val(amount);
      });
      set(q("totalAmount"), amountSum + val(q("freightCharges")));

      const bagConeWt = val(q("bagsWeight")) + val(q("conesWeight"));
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
