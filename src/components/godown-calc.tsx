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
}: {
  godownParty: string;
  countMap: Record<string, CountFill[]>;
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
        ]) put(n, "");
        return;
      }
      const meter = num("meter");
      const elMeter = Math.round((meter * num("el_cumi_num")) / (num("el_cumi_den") === 5 ? 400 : 800));
      const netMeter = meter - elMeter - num("kami_mtr");
      const rate = num("rate");
      const kaatAmt = Math.round((netMeter / 40) * num("kaat_percent"));
      const checkeryAmt = Math.round(netMeter * num("checkery"));
      const commissionAmt = Math.round((netMeter * rate * num("commission")) / 100);
      const total = Math.round(netMeter * rate);
      put("el_meter", String(elMeter));
      put("net_meter_display", String(r2(netMeter)));
      put("kaat_amt_disp", String(kaatAmt));
      put("checkery_amt_disp", String(checkeryAmt));
      put("commission_amt_disp", String(commissionAmt));
      put("total_display", String(total));
      put("balance_display", String(total - (kaatAmt + checkeryAmt + commissionAmt)));
      recalcTotLbs(netMeter);
    };

    const sources = [
      "meter", "el_cumi_num", "el_cumi_den", "kami_mtr", "rate",
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
      if (d?.name !== "cont_no") return;
      const rows = countMap[d.value ?? ""];
      if (!rows?.length) return;
      const codes = fields("count_code");
      const types = fields("count_type");
      if (codes.some((c) => c.value) || types.some((c) => c.value)) return;
      rows.slice(0, codes.length).forEach((row, i) => {
        const tr = codes[i].closest("tr");
        if (!tr) return;
        const cell = (name: string, v: string | number | null) =>
          setEl(tr.querySelector<HTMLInputElement>(`[name="${name}"]`), v == null ? "" : String(v));
        cell("count_code", row.code);
        cell("count_type", row.type);
        cell("count_cal_count", row.calCount);
        cell("count_ends", row.ends);
        cell("count_rate_per_lbs", row.ratePerLbs);
        cell("count_wt_per_mtr", row.wtPerMtr);
        cell("count_cost_per_mtr", row.costPerMtr);
      });
      recalc();
    };
    document.addEventListener("combobox:change", onCombo);

    fillGdnParty();
    recalc();
    return () => {
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onChange);
      document.removeEventListener("combobox:change", onCombo);
    };
  }, [godownParty, countMap]);
  return null;
}
