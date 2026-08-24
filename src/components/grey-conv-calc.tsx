"use client";

import { useEffect } from "react";

const round = (v: number, d: number) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

const HEADER_SOURCES = new Set([
  "rate_per_pick",
  "rate_mtr",
  "cost_lakhai_border_mtr",
  "pick",
  "read",
  "width",
]);
const ROW_SOURCE = /^(warp|weft)_(cal_count|ends|rate)_\d$/;

export function GreyConvCalc() {
  useEffect(() => {
    const q = (name: string) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    const val = (name: string) => {
      const n = parseFloat(q(name)?.value ?? "");
      return Number.isFinite(n) ? n : 0;
    };
    const set = (name: string, v: string) => {
      const el = q(name);
      if (!el || el.value === v) return;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const side = (prefix: "warp" | "weft") => {
      let wt = 0;
      let cost = 0;
      for (let i = 1; i <= 9; i++) {
        const calEl = q(`${prefix}_cal_count_${i}`);
        if (!calEl) continue;
        const endsEl = q(`${prefix}_ends_${i}`);
        const rateEl = q(`${prefix}_rate_${i}`);
        if (!calEl.value && !endsEl?.value && !rateEl?.value) {
          set(`${prefix}_wt_${i}`, "");
          set(`${prefix}_cost_${i}`, "");
          continue;
        }
        const cal = parseFloat(calEl.value);
        const rowWt =
          Number.isFinite(cal) && cal > 0
            ? round((val(`${prefix}_ends_${i}`) * 1.0936 / 800) / cal, 6)
            : 0;
        const rowCost = round(rowWt * val(`${prefix}_rate_${i}`), 4);
        set(`${prefix}_wt_${i}`, String(rowWt));
        set(`${prefix}_cost_${i}`, String(rowCost));
        wt += rowWt;
        cost += rowCost;
      }
      return { wt, cost };
    };

    const recompute = () => {
      const warp = side("warp");
      const weft = side("weft");
      const warpWt = round(warp.wt, 6);
      const weftWt = round(weft.wt, 6);
      const wtPerMtr = round(warpWt + weftWt, 6);
      const warpCost = round(warp.cost, 4);
      const weftCost = round(weft.cost, 4);
      const costPerMtr = round(warpCost + weftCost, 4);
      const ratePerPick = val("rate_per_pick");
      const clb = val("cost_lakhai_border_mtr");
      const convRate =
        ratePerPick > 0
          ? round(ratePerPick * val("pick") + clb, 4)
          : round(val("rate_mtr") + clb, 4);
      const grayRate = round(costPerMtr + convRate, 2);
      set("warp_wt_per_mtr", String(warpWt));
      set("weft_wt_per_mtr", String(weftWt));
      set("wt_per_mtr", String(wtPerMtr));
      set("warp_cost_per_mtr", String(warpCost));
      set("weft_cost_per_mtr", String(weftCost));
      set("cost_per_mtr", String(costPerMtr));
      set("conv_rate_per_mtr", String(convRate));
      set("gray_rate_per_mtr", String(grayRate));
      set("wrp_wt_40", String(round(warpWt * 40, 6)));
      set("wft_wt_40", String(round(weftWt * 40, 6)));
      set("weight_40", String(round(wtPerMtr * 40, 6)));
      set("warp_read_display", q("read")?.value ?? "");
      set("warp_pick_display", q("pick")?.value ?? "");
      set("weft_width_display", q("width")?.value ?? "");
    };

    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (!t?.name) return;
      if (HEADER_SOURCES.has(t.name) || ROW_SOURCE.test(t.name)) recompute();
    };

    recompute();
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, []);
  return null;
}
