"use client";

import { useEffect } from "react";

const round = (v: number, d: number) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

type BeamStat = { rcvd: number; length: number | null };

/**
 * Daily Production — Set# grid live math:
 *   Total  = A + B + C + CP + PPC
 *   Rcvd/Mtr = serverAccumulated (Σ totalCount+rejCount across ALL saved production
 *              excluding this voucher, keyed by beamNo) + thisRow.total + thisRow.rej
 *   Diff = bLength − rcvdMtr
 *   Shrinkage = diff / bLength × 100
 * The `data-near-empty` span in each row shows "NEAR EMPTY" while diff < 500.
 * Server-side saveAction recomputes totalCount authoritatively.
 */
export function ProductionSetCalc({
  beamStats,
}: {
  beamStats: Record<string, BeamStat>;
}) {
  useEffect(() => {
    const SOURCES = new Set([
      "aCount",
      "bCount",
      "cCount",
      "cpCount",
      "ppcCount",
      "rejCount",
      "beamNo",
      "bLength",
    ]);
    const each = (row: HTMLTableRowElement) => {
      const q = (n: string) => row.querySelector<HTMLInputElement>(`[name="${n}"]`);
      const num = (n: string) => {
        const x = parseFloat(q(n)?.value ?? "");
        return Number.isFinite(x) ? x : 0;
      };
      const totalEl = q("totalCount");
      if (!totalEl) return;
      const total = round(
        num("aCount") + num("bCount") + num("cCount") + num("cpCount") + num("ppcCount"),
        2
      );
      if (String(total) !== totalEl.value) {
        totalEl.value = total ? String(total) : "";
      }
      const beamNo = (q("beamNo")?.value ?? "").trim();
      const stat: BeamStat | undefined = beamNo ? beamStats[beamNo] : undefined;
      const bLenEl = q("bLength");
      if (bLenEl && !bLenEl.value && stat?.length != null) {
        bLenEl.value = String(stat.length);
      }
      const bLen = num("bLength");
      const rej = num("rejCount");
      const rcvd = beamNo ? round((stat?.rcvd ?? 0) + total + rej, 2) : 0;
      const diff = bLen > 0 ? round(bLen - rcvd, 2) : 0;
      const shr = bLen > 0 ? round((diff / bLen) * 100, 2) : 0;
      const rcvdEl = q("rcvdMtr");
      const diffEl = q("diff");
      const shrEl = q("shrinkage");
      if (rcvdEl) rcvdEl.value = beamNo && rcvd ? String(rcvd) : "";
      if (diffEl) diffEl.value = beamNo && bLen > 0 ? String(diff) : "";
      if (shrEl) shrEl.value = beamNo && bLen > 0 ? String(shr) : "";
      const hint = row.querySelector<HTMLElement>("[data-near-empty]");
      if (hint) {
        hint.textContent = beamNo && bLen > 0 && diff < 500 && diff >= 0 ? "NEAR EMPTY" : "";
      }
    };
    const recompute = () => {
      document.querySelectorAll<HTMLTableRowElement>("tr").forEach(each);
    };
    const onEvt = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t?.name) return;
      if (!SOURCES.has(t.name)) return;
      const tr = t.closest("tr");
      if (tr) each(tr);
    };
    recompute();
    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);
    return () => {
      document.removeEventListener("input", onEvt, true);
      document.removeEventListener("change", onEvt, true);
    };
  }, [beamStats]);
  return null;
}

/**
 * Grey Despatch — live amount chain and count-grid weight:
 *   qtyMtrs = Σ line_len_${i}
 *   amnt    = qtyMtrs × conv_rate
 *   gst     = amnt × gst_rate% / 100
 *   further = amnt × ftx_rate% / 100
 *   amt_tot = amnt + gst + further
 *   TOT Lbs (per count row) = wt_per_mtr × qtyMtrs
 * gst_rate / ftx_rate are unstored hidden inputs — filled by AutoFill on contract pick.
 */
export function DespatchAmountCalc({
  countRows = 5,
  lineRows = 15,
}: {
  countRows?: number;
  lineRows?: number;
}) {
  useEffect(() => {
    const q = (name: string) =>
      document.querySelector<HTMLInputElement>(`[name="${name}"]`);
    const num = (name: string) => {
      const x = parseFloat(q(name)?.value ?? "");
      return Number.isFinite(x) ? x : 0;
    };
    const set = (name: string, val: string) => {
      const el = q(name);
      if (!el || el.value === val) return;
      el.value = val;
    };
    const recompute = () => {
      let qtyMtrs = 0;
      let thanCount = 0;
      for (let i = 1; i <= lineRows; i++) {
        const l = num(`line_len_${i}`);
        qtyMtrs += l;
        const tv = (q(`line_t_sr_${i}`)?.value ?? "").trim();
        if (tv || l > 0) thanCount++;
      }
      qtyMtrs = round(qtyMtrs, 2);
      const convRate = num("conv_rate");
      const amnt = round(qtyMtrs * convRate, 2);
      const gstRate = num("gst_rate");
      const ftxRate = num("ftx_rate");
      const gst = round((amnt * gstRate) / 100, 2);
      const further = round((amnt * ftxRate) / 100, 2);
      const total = round(amnt + gst + further, 2);
      set("qty_mtrs_calc", qtyMtrs ? String(qtyMtrs) : "");
      set("than_qty_calc", thanCount ? String(thanCount) : "");
      set("amnt", amnt ? String(amnt) : "");
      set("gst", gst ? String(gst) : "");
      set("further", further ? String(further) : "");
      set("amt_tot", total ? String(total) : "");
      for (let i = 1; i <= countRows; i++) {
        const wt = num(`uc_wt_${i}`);
        set(`uc_tot_${i}`, wt && qtyMtrs ? String(round(wt * qtyMtrs, 2)) : "");
      }
    };
    const onEvt = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t?.name) return;
      if (
        t.name.startsWith("line_len_") ||
        t.name.startsWith("line_t_sr_") ||
        t.name.startsWith("uc_wt_") ||
        t.name === "conv_rate" ||
        t.name === "gst_rate" ||
        t.name === "ftx_rate"
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
  }, [countRows, lineRows]);
  return null;
}

type CountRow = {
  count?: string | null;
  calCount?: number | null;
  ends?: number | null;
  ratePerLbs?: number | null;
  wtPerMtr?: number | null;
  costPerMtr?: number | null;
};

/**
 * Populates the Update-Count grid from the selected Conv Contract. Combines
 * intGreyConversionWarp + intGreyConversionWeft rows for the contract (keyed by
 * contNo). Only fills empty cells so a manually edited grid is not clobbered.
 * Triggered by a combobox:change on `conv_cont_no`.
 */
export function CountGridFiller({
  contractRows,
  rows = 5,
}: {
  contractRows: Record<string, CountRow[]>;
  rows?: number;
}) {
  useEffect(() => {
    const fill = (contNo: string) => {
      const src = contractRows[contNo];
      if (!src || !src.length) return;
      for (let i = 1; i <= rows; i++) {
        const r = src[i - 1];
        if (!r) break;
        const setIfEmpty = (name: string, val: string) => {
          const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
          if (el && !el.value && val) {
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        };
        setIfEmpty(`uc_code_${i}`, r.count ?? "");
        setIfEmpty(`uc_cal_${i}`, r.calCount != null ? String(r.calCount) : "");
        setIfEmpty(`uc_ends_${i}`, r.ends != null ? String(r.ends) : "");
        setIfEmpty(`uc_rate_${i}`, r.ratePerLbs != null ? String(r.ratePerLbs) : "");
        setIfEmpty(`uc_wt_${i}`, r.wtPerMtr != null ? String(r.wtPerMtr) : "");
        setIfEmpty(`uc_cost_${i}`, r.costPerMtr != null ? String(r.costPerMtr) : "");
      }
    };
    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name === "conv_cont_no") fill(d.value ?? "");
    };
    document.addEventListener("combobox:change", onCombo);
    return () => document.removeEventListener("combobox:change", onCombo);
  }, [contractRows, rows]);
  return null;
}
