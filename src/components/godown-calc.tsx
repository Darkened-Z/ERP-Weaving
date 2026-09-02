"use client";

import { useEffect } from "react";

type CountFill = {
  code: string | null;
  type: string;
  calCount: number | null;
  ends: number | null;
  ratePerLbs: number | null;
  wtPerMtr: number | null;
  costPerMtr: number | null;
};

export function GodownCalc({
  godownParty,
  countMap,
  countLabel = {},
}: {
  godownParty: string;
  countMap: Record<string, CountFill[]>;
  countLabel?: Record<string, string>;
}) {
  useEffect(() => {
    const form = document.getElementById("gdn-save-form") as HTMLFormElement | null;
    if (!form) return;
    const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);
    const fields = (name: string) => Array.from(form.querySelectorAll<HTMLInputElement>(`[name="${name}"]`));
    const num = (name: string) => {
      const n = parseFloat(field(name)?.value ?? "");
      return Number.isFinite(n) ? n : 0;
    };
    const setEl = (el: HTMLInputElement | null, v: string) => {
      if (!el || el.value === v) return;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const put = (name: string, v: string) => setEl(field(name), v);
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const recalcTotLbs = (netMeter: number) => {
      const wts = fields("count_wt_per_mtr");
      const tots = fields("count_tot_lbs");
      wts.forEach((w, i) => {
        const wv = parseFloat(w.value);
        if (Number.isFinite(wv)) setEl(tots[i] ?? null, String(r2(wv * netMeter)));
      });
    };

    const recalc = () => {
      const meterRaw = (field("meter")?.value ?? "").trim();
      if (!meterRaw) {
        for (const n of [
          "el_meter", "net_meter_display", "kaat_amt_disp", "checkery_amt_disp",
          "commission_amt_disp", "total_display", "balance_display",
          "cost_rate_disp", "sale_rate_disp", "profit_rate_disp", "profit_amt_disp",
        ]) put(n, "");
        return;
      }
      const meter = num("meter");
      const elMeter = Math.round((meter * num("el_cumi_num")) / (num("el_cumi_den") === 5 ? 400 : 800));
      const netMeter = meter - elMeter - num("kami_mtr");
      // Total & commission use the (editable) purchase rate. Net Balance = Total − charges.
      const rate = num("rate");
      const kaatAmt = Math.round((netMeter / 40) * num("kaat_percent"));
      const checkeryAmt = Math.round(netMeter * num("checkery"));
      const commissionAmt = Math.round((netMeter * rate * num("commission")) / 100);
      const total = Math.round(netMeter * rate);
      // Profit = sale rate − cost rate. Sale rate comes from the Grey Sale Cont's rate
      // (Rate Sale field removed); mirror it into the hidden rate_sal so it still saves.
      const saleRate = num("grey_sale_rate_disp");
      put("rate_sal", saleRate ? String(saleRate) : "");
      const hasBoth = saleRate > 0 && rate > 0;
      const profitPerMtr = hasBoth ? r2(saleRate - rate) : 0;
      const profitAmt = hasBoth ? Math.round(netMeter * (saleRate - rate)) : 0;
      put("el_meter", String(elMeter));
      put("net_meter_display", String(r2(netMeter)));
      put("kaat_amt_disp", String(kaatAmt));
      put("checkery_amt_disp", String(checkeryAmt));
      put("commission_amt_disp", String(commissionAmt));
      put("total_display", String(total));
      put("balance_display", String(total - (kaatAmt + checkeryAmt + commissionAmt)));
      put("cost_rate_disp", rate ? String(rate) : "");
      put("sale_rate_disp", saleRate ? String(saleRate) : "");
      put("profit_rate_disp", hasBoth ? String(profitPerMtr) : "");
      put("profit_amt_disp", hasBoth ? String(profitAmt) : "");
      recalcTotLbs(netMeter);
    };

    const sources = [
      "meter", "el_cumi_num", "el_cumi_den", "kami_mtr", "rate", "grey_sale_rate_disp",
      "kaat_percent", "checkery", "commission", "count_wt_per_mtr",
    ];
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t?.name && sources.includes(t.name)) recalc();
    };
    form.addEventListener("input", onInput);

    const fillGdnParty = () => {
      if (!godownParty) return;
      const typeSel = form.querySelector<HTMLSelectElement>('[name="type"]');
      if (typeSel?.value !== "STOCK") return;
      const current = field("gdn_party");
      if (current?.value) return;
      document.dispatchEvent(
        new CustomEvent("combobox:set", { detail: { name: "gdn_party", value: godownParty } })
      );
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLSelectElement;
      if (t?.name === "type") fillGdnParty();
    };
    form.addEventListener("change", onChange);

    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      // Conv Cont # and Grey Sale Cont are one-at-a-time: picking one clears the other.
      if (d?.name === "sal_cont_no" && d.value) {
        document.dispatchEvent(new CustomEvent("combobox:set", { detail: { name: "grey_sale_cont", value: "" } }));
      } else if (d?.name === "grey_sale_cont" && d.value) {
        document.dispatchEvent(new CustomEvent("combobox:set", { detail: { name: "sal_cont_no", value: "" } }));
      }
      if (d?.name !== "cont_no") return;
      const rows = countMap[d.value ?? ""] ?? [];
      if (!rows.length) return; // this contract carries no counts — leave the grid alone
      const codes = fields("count_code");
      const CNT = ["count_code", "count_desc", "count_type", "count_cal_count", "count_ends", "count_rate_per_lbs", "count_wt_per_mtr", "count_cost_per_mtr", "count_tot_lbs"];
      // Picking a contract DISTRIBUTES its warp/weft counts onto the grid (overwrite; clear extra rows).
      codes.forEach((codeEl, i) => {
        const tr = codeEl.closest("tr");
        if (!tr) return;
        const cell = (name: string, v: string | number | null) =>
          setEl(tr.querySelector<HTMLInputElement>(`[name="${name}"]`), v == null ? "" : String(v));
        const row = rows[i];
        if (row) {
          cell("count_code", row.code);
          cell("count_desc", row.code ? countLabel[String(row.code)] ?? "" : ""); // e.g. "2" → "30/S MVS PV 65;35"
          cell("count_type", row.type);
          cell("count_cal_count", row.calCount);
          cell("count_ends", row.ends);
          cell("count_rate_per_lbs", row.ratePerLbs);
          cell("count_wt_per_mtr", row.wtPerMtr);
          cell("count_cost_per_mtr", row.costPerMtr);
        } else {
          for (const n of CNT) cell(n, ""); // clear rows beyond this contract's counts
        }
      });
      recalc(); // recomputes each count's TOT Lbs = wt/mtr × net meter (the quantity distribution)
    };
    document.addEventListener("combobox:change", onCombo);

    fillGdnParty();
    recalc();
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onChange);
      document.removeEventListener("combobox:change", onCombo);
    };
  }, [godownParty, countMap, countLabel]);
  return null;
}
