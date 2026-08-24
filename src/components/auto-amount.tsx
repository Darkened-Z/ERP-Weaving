"use client";

import { useEffect } from "react";

/**
 * Live-computes target = (qty [+ qty2]) * rate * factor within the target
 * field's form, by field name. Server-rendered forms stay server-rendered;
 * this just enhances them. `factor` covers unit conversions (e.g. bags→lbs
 * where 1 bag = 100 lbs); `qty2` covers extension quantities added to qty.
 */
export function AutoAmount({
  qty,
  qty2,
  rate,
  target,
  factor = 1,
  round = 2,
}: {
  qty: string;
  qty2?: string;
  rate: string;
  target: string;
  factor?: number;
  round?: number;
}) {
  useEffect(() => {
    const t = document.querySelector<HTMLInputElement>(`[name="${target}"]`);
    const form = t?.closest("form");
    if (!form || !t) return;
    const q = form.querySelector<HTMLInputElement>(`[name="${qty}"]`);
    const q2 = qty2 ? form.querySelector<HTMLInputElement>(`[name="${qty2}"]`) : null;
    const r = form.querySelector<HTMLInputElement>(`[name="${rate}"]`);
    if (!q || !r) return;

    const recalc = () => {
      const qv = parseFloat(q.value);
      const q2v = q2 ? parseFloat(q2.value) : 0;
      const rv = parseFloat(r.value);
      if (Number.isFinite(qv) && Number.isFinite(rv)) {
        const p = 10 ** round;
        const total = (qv + (Number.isFinite(q2v) ? q2v : 0)) * rv * factor;
        t.value = String(Math.round(total * p) / p);
        t.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    q.addEventListener("input", recalc);
    q2?.addEventListener("input", recalc);
    r.addEventListener("input", recalc);
    return () => {
      q.removeEventListener("input", recalc);
      q2?.removeEventListener("input", recalc);
      r.removeEventListener("input", recalc);
    };
  }, [qty, qty2, rate, target, factor, round]);

  return null;
}
