"use client";

import { useEffect } from "react";

/**
 * Live line-amount + total for the Knotting/Maroori/Sarning grid.
 * Mirrors the server formula: amount = ends × ratePerEnds when Rate Per Ends is
 * set, else ratePerBeam per active row; net = amount + ext amt. Writes each row's
 * Amount / Net Amt and the running Total Amount (#ks-total). Amount/Net are
 * recomputed server-side on save too, so overwriting them here is safe.
 */
export function KnottingCalc() {
  useEffect(() => {
    const fmt = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);
    const val = (name: string) =>
      parseFloat((document.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value ?? "");

    const recompute = () => {
      const rpe = val("rate_per_ends") || 0;
      const rpb = val("rate_per_beam") || 0;
      let total = 0;
      document.querySelectorAll("#ks-lines tbody tr").forEach((tr) => {
        const q = (n: string) => tr.querySelector(`[name="${n}"]`) as HTMLInputElement | null;
        const amtEl = q("amount");
        const netEl = q("net_amt");
        if (!amtEl || !netEl) return;
        const endsRaw = q("ends")?.value ?? "";
        const ends = parseFloat(endsRaw);
        const active = !!(q("beam_no")?.value || q("beam_set_no")?.value || endsRaw.trim());
        let amt: number | null = null;
        if (rpe > 0) amt = Number.isFinite(ends) ? Math.round(ends * rpe * 100) / 100 : null;
        else if (rpb > 0) amt = active ? rpb : null;

        if (!active && amt == null) {
          amtEl.value = "";
          netEl.value = "";
          return;
        }
        if (amt != null) amtEl.value = String(amt);
        const ext = parseFloat(q("ext_amt")?.value ?? "");
        if (amt != null || Number.isFinite(ext)) {
          const net = Math.round(((amt ?? 0) + (Number.isFinite(ext) ? ext : 0)) * 100) / 100;
          netEl.value = String(net);
          total += net;
        }
      });
      const totEl = document.getElementById("ks-total");
      if (totEl) totEl.textContent = fmt(total);
    };

    // Defer so it runs after RowAutoFill has populated sibling cells (ends, etc.).
    const onEvt = () => setTimeout(recompute, 0);
    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);
    const t = setTimeout(recompute, 0);
    return () => {
      document.removeEventListener("input", onEvt, true);
      document.removeEventListener("change", onEvt, true);
      clearTimeout(t);
    };
  }, []);
  return null;
}
