"use client";

import { useEffect } from "react";

export function KachiCalc() {
  useEffect(() => {
    const form = document.getElementById("kp-save-form") as HTMLFormElement | null;
    if (!form) return;
    const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);
    const num = (name: string) => {
      const n = parseFloat(field(name)?.value ?? "");
      return Number.isFinite(n) ? n : 0;
    };
    const put = (name: string, v: string) => {
      const el = field(name);
      if (!el || el.value === v) return;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const den = (d: number) => (d === 5 ? 400 : 800);
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const recalc = () => {
      const meterRaw = (field("meter")?.value ?? "").trim();
      if (!meterRaw) {
        for (const n of ["el_meter", "baad_meter", "total_el_bad_mtrs", "amt_pur_disp", "conv_amt_disp"]) put(n, "");
        return;
      }
      const meter = num("meter");
      const elMeter = Math.round((meter * num("el_cumi_num")) / den(num("el_cumi_den")));
      const baadMeter = Math.round((meter * num("bad_cumi_num")) / den(num("bad_cumi_den")));
      put("el_meter", String(elMeter));
      put("baad_meter", String(baadMeter));
      put("total_el_bad_mtrs", String(elMeter + baadMeter));
      put("amt_pur_disp", String(r2(meter * num("grey_rate"))));
      put("conv_amt_disp", String(r2(meter * num("conv_rate"))));
    };

    const sources = ["meter", "el_cumi_num", "el_cumi_den", "bad_cumi_num", "bad_cumi_den", "grey_rate", "conv_rate"];
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t?.name && sources.includes(t.name)) recalc();
    };
    form.addEventListener("input", onInput);
    recalc();
    return () => form.removeEventListener("input", onInput);
  }, []);
  return null;
}
