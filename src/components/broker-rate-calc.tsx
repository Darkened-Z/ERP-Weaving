"use client";

import { useEffect } from "react";

/**
 * Two-way broker rate calc for the grey-conversion contract.
 *   rate/mtr = rate/pick × pick
 *   rate/pick = rate/mtr ÷ pick
 * Whichever the operator types, the other auto-fills. Uses event.isTrusted to
 * break the feedback loop (our own programmatic sets are untrusted and ignored).
 * Also recomputes rate/mtr when the pick value changes.
 */
export function BrokerRateCalc({
  pickField = "pick",
  ratePickField = "rate_pick",
  rateMtrField = "broker_rate_mtr",
}: {
  pickField?: string;
  ratePickField?: string;
  rateMtrField?: string;
}) {
  useEffect(() => {
    const q = (n: string) => document.querySelector<HTMLInputElement>(`input[name="${n}"]`);
    const val = (n: string) => {
      const v = parseFloat(q(n)?.value ?? "");
      return Number.isFinite(v) ? v : 0;
    };
    const setSilently = (n: string, v: string) => {
      const el = q(n);
      if (!el || el.value === v) return;
      el.value = v; // no event dispatch → no loop
    };
    const round = (v: number) => Math.round(v * 10000) / 10000;

    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t?.name || !e.isTrusted) return; // ignore our own programmatic writes
      const pick = val(pickField);
      if (t.name === ratePickField) {
        setSilently(rateMtrField, pick > 0 ? String(round(val(ratePickField) * pick)) : "");
      } else if (t.name === rateMtrField) {
        setSilently(ratePickField, pick > 0 ? String(round(val(rateMtrField) / pick)) : "");
      } else if (t.name === pickField) {
        // pick changed → refresh mtr from the current pick rate
        setSilently(rateMtrField, pick > 0 ? String(round(val(ratePickField) * pick)) : "");
      }
    };

    // Initial fill on mount (edit mode with a saved rate/pick)
    const pick = val(pickField);
    if (pick > 0 && val(ratePickField) > 0 && !q(rateMtrField)?.value) {
      setSilently(rateMtrField, String(round(val(ratePickField) * pick)));
    }

    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
    };
  }, [pickField, ratePickField, rateMtrField]);

  return null;
}
