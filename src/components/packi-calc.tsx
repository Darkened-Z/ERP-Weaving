"use client";

import { useEffect } from "react";

const WATCH = new Set([
  "kp_meter", "meter_re", "meter_kam", "el_cumi_num", "el_cumi_den",
  "meter_fine_num", "meter_fine_den", "grey_rate", "grey_rate_kp", "wkc_brk",
  "checkery", "commission", "commission_sale", "kaat_percent_sale", "checkery_sale",
  "broker_percent", "broker_percent_sale", "woc", "wc", "wck",
  "warp_wt", "warp_rate", "weft_wt", "weft_rate",
]);

const field = (name: string) =>
  document.querySelector<HTMLInputElement>(`#pp-save-form [name="${name}"]`);

const numOf = (name: string): number | null => {
  const n = parseFloat(field(name)?.value ?? "");
  return Number.isFinite(n) ? n : null;
};

const setNum = (name: string, v: number | null, dp = 0) => {
  const el = field(name);
  if (!el) return;
  const p = 10 ** dp;
  el.value = v == null ? "" : String(Math.round(v * p) / p);
};

// EL/fine cumi denominators are Oracle slabs: /5 means per-400m, anything else per-800m.
const cumiDiv = (den: number) => (den === 5 ? 400 : 800);

function recompute() {
  const r = Math.round;
  const kpMeter = numOf("kp_meter");
  const meterRe = numOf("meter_re") ?? 0;
  const meterKam = numOf("meter_kam") ?? 0;
  const greyRate = numOf("grey_rate");

  if (numOf("wkc_brk") == null && greyRate != null && greyRate > 0) {
    setNum("wkc_brk", Math.min(Math.max(Math.floor(greyRate / 10), 1), 9));
  }
  if (numOf("checkery") == null) setNum("checkery", 0.07, 2);

  const elNum = numOf("el_cumi_num");
  const elDen = numOf("el_cumi_den");
  let elMtr = numOf("el_meter") ?? 0;
  if (kpMeter != null && elNum != null && elDen != null) {
    elMtr = r(((kpMeter - meterRe) * elNum) / cumiDiv(elDen));
    setNum("el_meter", elMtr);
  }
  const fnNum = numOf("meter_fine_num");
  const fnDen = numOf("meter_fine_den");
  const fineMtr =
    kpMeter != null && fnNum != null && fnDen != null
      ? r(((kpMeter - meterRe) * fnNum) / cumiDiv(fnDen))
      : 0;

  const meterNet =
    kpMeter == null
      ? null
      : Math.round((kpMeter - elMtr - meterRe - fineMtr - meterKam) * 100) / 100;
  setNum("meter_net", meterNet, 2);

  for (const s of ["warp", "weft"]) {
    const wt = numOf(`${s}_wt`);
    const rate = numOf(`${s}_rate`);
    const bags =
      wt != null && meterNet != null ? Math.round(((wt * meterNet) / 100) * 100) / 100 : null;
    setNum(`${s}_bags`, bags, 2);
    setNum(`${s}_amount`, bags != null && rate != null ? r(bags * rate * 100) : null);
  }

  if (meterNet == null) return;

  const greyRateKp = numOf("grey_rate_kp") ?? 0;
  const greyAmtPur = r(meterNet * (greyRate ?? 0));
  const kaatAmt = r((meterNet / 40) * (numOf("wkc_brk") ?? 0));
  const checkeryAmt = r((kpMeter ?? 0) * (numOf("checkery") ?? 0));
  const commissionAmtPv = r((meterNet * greyRateKp * (numOf("commission") ?? 0)) / 100);
  const brokerAmtPv = r((greyAmtPur * (numOf("broker_percent") ?? 0)) / 100);
  const purBal = greyAmtPur - kaatAmt - checkeryAmt - brokerAmtPv - commissionAmtPv;

  const greyAmtSal = r(meterNet * greyRateKp);
  const commissionSaleAmt = r((greyAmtSal * (numOf("commission_sale") ?? 0)) / 100);
  const kaatSalAmt = r((greyAmtSal * (numOf("kaat_percent_sale") ?? 0)) / 100);
  const checkerySalAmt = r((meterNet / 40) * (numOf("checkery_sale") ?? 0));
  const salAmtTot = greyAmtSal + commissionSaleAmt - kaatSalAmt - checkerySalAmt;

  const brokerAmtSal = r((greyAmtSal * (numOf("broker_percent_sale") ?? 0)) / 100);
  const salAmtDiff = salAmtTot - purBal;
  const commissionTotal = r(salAmtDiff - brokerAmtSal - brokerAmtPv);
  const diff =
    commissionTotal - ((numOf("woc") ?? 0) + (numOf("wc") ?? 0) + (numOf("wck") ?? 0));

  setNum("sal_amt_diff", salAmtDiff);
  setNum("commission_total", commissionTotal);
  setNum("diff", diff);

  // Visible summary boxes the owner asked for.
  setNum("grey_amt_pur_disp", greyAmtPur); // Purchase amount = net meter × purchase (grey) rate
  setNum("broker_amt_sal_disp", brokerAmtSal); // brokerage amount from the sale-side broker %
  setNum("sale_net_disp", salAmtTot); // sale-side net
  setNum("sale_amt_disp", greyAmtSal); // sale rate amount (before commission)
  setNum("commission_amt_sal_disp", commissionSaleAmt); // commission value (+add / −less on bill)
}

function syncDueDate() {
  const wrap = document.getElementById("pp-due-date-wrap");
  if (wrap) wrap.style.display = field("term_sal")?.value === "DUE" ? "" : "none";
}

function syncKpList() {
  const checked = field("kp_all")?.checked ?? false;
  const unconv = document.getElementById("pp-kp-wrap-unconv");
  const all = document.getElementById("pp-kp-wrap-all");
  if (unconv) unconv.style.display = checked ? "none" : "";
  if (all) all.style.display = checked ? "" : "none";
}

type CountFill = { code: string | null; descr: string | null; brand: string | null; type: string; calCount: number | null; ends: number | null; ratePerLbs: number | null; wtPerMtr: number | null; costPerMtr: number | null };

// Count grid: TOT Lbs = wt/mtr × net meter (yarn consumed), then warp/weft/total
// lbs and the amount (Σ tot × rate) footers.
function recalcCountTot() {
  const form = document.getElementById("pp-save-form");
  if (!form) return;
  const meterNet = parseFloat(form.querySelector<HTMLInputElement>('[name="meter_net"]')?.value ?? "");
  const rows = Array.from(form.querySelectorAll<HTMLInputElement>('[name="count_wt"]'));
  let warpLbs = 0, weftLbs = 0, amt = 0;
  rows.forEach((w) => {
    const tr = w.closest("tr");
    if (!tr) return;
    const totEl = tr.querySelector<HTMLInputElement>('[name="count_tot"]');
    const wv = parseFloat(w.value);
    let tv = parseFloat(totEl?.value ?? "");
    if (Number.isFinite(wv) && Number.isFinite(meterNet)) {
      tv = Math.round(wv * meterNet * 100) / 100;
      if (totEl) totEl.value = String(tv);
    }
    if (!Number.isFinite(tv)) tv = 0;
    const type = (tr.querySelector<HTMLInputElement>('[name="count_type"]')?.value ?? "").toUpperCase();
    const rate = parseFloat(tr.querySelector<HTMLInputElement>('[name="count_rate"]')?.value ?? "") || 0;
    if (type.includes("WARP")) warpLbs += tv;
    else if (type.includes("WEFT")) weftLbs += tv;
    amt += tv * rate;
  });
  const put = (n: string, v: number) => {
    const el = form.querySelector<HTMLInputElement>(`[name="${n}"]`);
    if (el) el.value = String(Math.round(v * 100) / 100);
  };
  put("count_warp_lbs_disp", warpLbs);
  put("count_weft_lbs_disp", weftLbs);
  put("count_tot_lbs_disp", warpLbs + weftLbs);
  put("count_amt_disp", amt);
}

export function PackiCalc({
  convCountMap = {},
  countLabel = {},
}: {
  convCountMap?: Record<string, CountFill[]>;
  countLabel?: Record<string, string>;
} = {}) {
  useEffect(() => {
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t?.name && WATCH.has(t.name)) { recompute(); recalcCountTot(); }
      else if (t?.name?.startsWith("count_")) recalcCountTot();
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t?.name === "term_sal") syncDueDate();
      if (t?.name === "kp_all") syncKpList();
      // Picking a broker defaults its commission to 1% (still editable).
      if (t?.name === "broker_name_sale") {
        if (t.value && numOf("broker_percent_sale") == null) setNum("broker_percent_sale", 1, 2);
        recompute();
      }
      if (t?.name && WATCH.has(t.name)) { recompute(); recalcCountTot(); }
      else if (t?.name?.startsWith("count_")) recalcCountTot();
    };

    const setCombo = (name: string, value: string) =>
      document.dispatchEvent(new CustomEvent("combobox:set", { detail: { name, value } }));

    const distributeCounts = (contNo: string) => {
      const form = document.getElementById("pp-save-form");
      if (!form) return;
      const codes = Array.from(form.querySelectorAll<HTMLInputElement>('[name="count_code"]'));
      const rows = convCountMap[contNo] ?? [];
      const NAMES = ["count_code", "count_desc", "count_brand", "count_type", "count_cal", "count_ends", "count_rate", "count_wt", "count_cost", "count_tot"];
      codes.forEach((codeEl, i) => {
        const tr = codeEl.closest("tr");
        if (!tr) return;
        const cell = (name: string, v: string | number | null) => {
          const el = tr.querySelector<HTMLInputElement>(`[name="${name}"]`);
          if (el) { el.value = v == null ? "" : String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }
        };
        const row = rows[i];
        if (row) {
          cell("count_code", row.code);
          cell("count_desc", row.descr ?? (row.code ? countLabel[String(row.code)] ?? "" : ""));
          cell("count_brand", row.brand);
          cell("count_type", row.type);
          cell("count_cal", row.calCount);
          cell("count_ends", row.ends);
          cell("count_rate", row.ratePerLbs);
          cell("count_wt", row.wtPerMtr);
          cell("count_cost", row.costPerMtr);
        } else {
          for (const n of NAMES) cell(n, "");
        }
      });
      recalcCountTot();
    };

    // Grey Sale Contract and Conversion Contract are one-at-a-time; picking the
    // conversion contract also distributes its warp/weft counts into the grid.
    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name === "conv_cont_no_sale" && d.value) {
        setCombo("conv_cont_sale2", "");
        distributeCounts(""); // grey-sale contract carries no warp/weft counts → clear the grid
      } else if (d?.name === "conv_cont_sale2" && d.value) {
        setCombo("conv_cont_no_sale", "");
        distributeCounts(d.value);
      }
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("combobox:change", onCombo);
    syncDueDate();
    syncKpList();
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("combobox:change", onCombo);
    };
  }, [convCountMap, countLabel]);
  return null;
}
