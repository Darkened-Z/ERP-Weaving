"use client";

import { useEffect } from "react";

type CountEntry = { calWarp: number | null; calWeft: number | null; rate: number | null };
type PartyData = { counts: Array<{ code: string; label: string }>; byCount: Record<string, CountEntry> };

/**
 * Grey-conversion WARP/WEFT grid helper.
 *
 * When a PARTY is selected at the top of the contract, the COUNT datalist in
 * the warp/weft grid is rebuilt to show ONLY that party's counts (from the
 * party_counts master). Picking a count in a row then auto-fills that row's
 * Cal Count (calCountWarp for warp, calCountWeft for weft) and Rate Per Lbs
 * from party_counts — so the operator doesn't re-enter what the party master
 * already defines.
 *
 * No party selected → the datalist falls back to all counts.
 */
export function PartyCountGrid({
  datalistId,
  partyField = "party",
  partyCodeByDesc,
  partyCountData,
  allCounts,
  warpPrefix = "warp",
  weftPrefix = "weft",
  rows = 8,
}: {
  datalistId: string;
  partyField?: string;
  partyCodeByDesc: Record<string, string>;
  partyCountData: Record<string, PartyData>;
  allCounts: Array<{ code: string; label: string }>;
  warpPrefix?: string;
  weftPrefix?: string;
  rows?: number;
}) {
  useEffect(() => {
    const q = (n: string) => document.querySelector<HTMLInputElement>(`input[name="${n}"]`);
    const datalist = document.getElementById(datalistId);

    const partyValue = () => (q(partyField)?.value ?? "").trim();
    const dataFor = (desc: string) => {
      const code = partyCodeByDesc[desc];
      return code ? partyCountData[code] : undefined;
    };

    const rebuildDatalist = (desc: string) => {
      if (!datalist) return;
      const data = dataFor(desc);
      const opts = data && data.counts.length ? data.counts : allCounts;
      datalist.innerHTML = "";
      for (const o of opts) {
        const el = document.createElement("option");
        el.value = o.code;
        el.textContent = o.label;
        datalist.appendChild(el);
      }
    };

    const setVal = (n: string, v: string) => {
      const el = q(n);
      if (!el || el.value === v) return;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    const fillRow = (prefix: string, i: number, isWarp: boolean, desc: string) => {
      const countEl = q(`${prefix}_count_${i}`);
      if (!countEl) return;
      const code = (countEl.value ?? "").trim();
      if (!code) return;
      const entry = dataFor(desc)?.byCount[code];
      if (!entry) return;
      const cal = isWarp ? entry.calWarp : entry.calWeft;
      if (cal != null) setVal(`${prefix}_cal_count_${i}`, String(cal));
      if (entry.rate != null) setVal(`${prefix}_rate_${i}`, String(entry.rate));
    };

    const refillAll = (desc: string) => {
      for (let i = 1; i <= rows; i++) {
        fillRow(warpPrefix, i, true, desc);
        fillRow(weftPrefix, i, false, desc);
      }
    };

    const onEvent = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      const detail = (e as CustomEvent).detail as { value?: string; name?: string } | undefined;
      const name = t?.name ?? detail?.name;
      if (!name) return;

      if (name === partyField) {
        // On combobox:change the hidden input may not be updated yet — prefer detail.value
        const desc = (detail?.value ?? partyValue()).trim();
        rebuildDatalist(desc);
        refillAll(desc);
        return;
      }
      const desc = partyValue();
      const mw = name.match(new RegExp(`^${warpPrefix}_count_(\\d+)$`));
      if (mw) return fillRow(warpPrefix, parseInt(mw[1], 10), true, desc);
      const mf = name.match(new RegExp(`^${weftPrefix}_count_(\\d+)$`));
      if (mf) return fillRow(weftPrefix, parseInt(mf[1], 10), false, desc);
    };

    rebuildDatalist(partyValue());
    document.addEventListener("input", onEvent, true);
    document.addEventListener("change", onEvent, true);
    document.addEventListener("combobox:change", onEvent, true);
    return () => {
      document.removeEventListener("input", onEvent, true);
      document.removeEventListener("change", onEvent, true);
      document.removeEventListener("combobox:change", onEvent, true);
    };
  }, [datalistId, partyField, partyCodeByDesc, partyCountData, allCounts, warpPrefix, weftPrefix, rows]);

  return null;
}
