"use client";

import { useEffect } from "react";

/**
 * Live-computes target = qty * rate within the target field's form, by field name.
 * Server-rendered forms stay server-rendered; this just enhances them.
 */
export function AutoAmount({
  qty,
  rate,
  target,
  round = 2,
}: {
  qty: string;
  rate: string;
  target: string;
  round?: number;
}) {
  useEffect(() => {
    const t = document.querySelector<HTMLInputElement>(`[name="${target}"]`);
    const form = t?.closest("form");
    if (!form || !t) return;
    const q = form.querySelector<HTMLInputElement>(`[name="${qty}"]`);
    const r = form.querySelector<HTMLInputElement>(`[name="${rate}"]`);
    if (!q || !r) return;

    const recalc = () => {
      const qv = parseFloat(q.value);
      const rv = parseFloat(r.value);
      if (Number.isFinite(qv) && Number.isFinite(rv)) {
        const factor = 10 ** round;
        t.value = String(Math.round(qv * rv * factor) / factor);
        t.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    q.addEventListener("input", recalc);
    r.addEventListener("input", recalc);
    return () => {
      q.removeEventListener("input", recalc);
      r.removeEventListener("input", recalc);
    };
  }, [qty, rate, target, round]);

  return null;
}
