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
      let amountSum = 0;
      form.querySelectorAll("tbody tr").forEach((tr) => {
        const loaded = tr.querySelector<HTMLInputElement>('[name="beamLoadedHnk"]');
        const net = tr.querySelector<HTMLInputElement>('[name="yarnBmsNetLbs"]');
        if (net && loaded?.value) {
          set(net, (val(loaded) - val(tr.querySelector<HTMLInputElement>('[name="emptyKg"]'))) * KG_TO_LBS);
        }
        amountSum += val(tr.querySelector<HTMLInputElement>('[name="amount"]'));
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
      const amount = (bagConeWt - packWt) * val(q("netWeightRate"));
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
