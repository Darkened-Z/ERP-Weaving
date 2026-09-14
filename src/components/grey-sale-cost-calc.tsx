"use client";

import { useEffect } from "react";

/**
 * Grey Sale Contract costing chain, live as the warp/weft grids are typed:
 *
 *   row cost/mtr = Ends ÷ 731.52 ÷ Cal Count × Rate/Lbs
 *   warp cost    = Σ warp rows        weft cost = Σ weft rows
 *   total cost   = warp + weft + Conv. Calculate + Selvage
 *
 * The same arithmetic runs again on the server at save time, so the stored
 * figures cannot drift from the grid even if this never runs.
 */
export function GreySaleCostCalc({ rows = 9 }: { rows?: number }) {
  useEffect(() => {
    const num = (name: string) => {
      const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
      const n = parseFloat(el?.value ?? "");
      return Number.isFinite(n) ? n : 0;
    };
    const setById = (id: string, v: number) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      const next = v ? String(Math.round(v * 10000) / 10000) : "";
      if (el.value !== next) el.value = next;
    };
    const sideCost = (prefix: "warp" | "weft") => {
      let total = 0;
      for (let i = 1; i <= rows; i++) {
        const cal = num(`${prefix}_cal_count_${i}`);
        if (cal <= 0) continue;
        total += (num(`${prefix}_ends_${i}`) / 731.52 / cal) * num(`${prefix}_rate_${i}`);
      }
      return total;
    };
    const recompute = () => {
      const warp = sideCost("warp");
      const weft = sideCost("weft");
      setById("gs-warp-cost", warp);
      setById("gs-weft-cost", weft);
      setById("gs-total-cost", warp + weft + num("conv_calculate") + num("selvage_rate"));
    };
    const onEvt = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t?.name) return;
      if (
        /^(warp|weft)_(cal_count|ends|rate)_\d+$/.test(t.name) ||
        t.name === "conv_calculate" ||
        t.name === "selvage_rate"
      ) {
        recompute();
      }
    };
    recompute();
    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);
    return () => {
      document.removeEventListener("input", onEvt, true);
      document.removeEventListener("change", onEvt, true);
    };
  }, [rows]);
  return null;
}
