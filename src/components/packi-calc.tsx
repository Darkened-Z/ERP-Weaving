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

export function PackiCalc() {
  useEffect(() => {
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t?.name && WATCH.has(t.name)) recompute();
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
      if (t?.name && WATCH.has(t.name)) recompute();
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    syncDueDate();
    syncKpList();
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
    };
  }, []);
  return null;
}
