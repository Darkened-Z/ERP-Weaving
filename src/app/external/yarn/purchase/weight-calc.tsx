"use client";

import { useEffect } from "react";

/** Default weight when bags change; preserve saved/manual weight on unchanged blur. */
export function PurchaseWeightCalc() {
  useEffect(() => {
    const previous = new WeakMap<HTMLInputElement, string>();
    const onInput = (event: Event) => {
      const qty = event.target;
      if (!(qty instanceof HTMLInputElement) || qty.name !== "line_qty" || !qty.closest("#ypv-line-rows")) return;
      const old = previous.get(qty) ?? qty.defaultValue;
      previous.set(qty, qty.value);
      if (old === qty.value || (old !== "" && qty.value !== "" && Number(old) === qty.valueAsNumber)) return;
      const lbs = qty.closest("tr")?.querySelector<HTMLInputElement>('[name="line_lbs"]');
      if (!lbs || (qty.value !== "" && !Number.isFinite(qty.valueAsNumber))) return;
      lbs.value = qty.value === "" ? "" : String(Math.round(qty.valueAsNumber * 10000) / 100);
      lbs.dispatchEvent(new Event("input", { bubbles: true }));
    };
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, []);
  return null;
}
