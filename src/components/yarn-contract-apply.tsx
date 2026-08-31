"use client";

import { useEffect } from "react";

/**
 * Yarn Purchase: when a contract is picked in the header, fill the FIRST line row
 * (count / desc / brand / rate) from that contract and jump the cursor straight into
 * the line-items grid — so the user goes party → contract → line items without
 * stopping at broker / % / term (those auto-fill above).
 */
export function YarnContractApply({
  lineMap,
}: {
  lineMap: Record<string, Record<string, string | number>>;
}) {
  useEffect(() => {
    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name !== "cont") return;
      const fill = lineMap[d.value ?? ""];

      // First data row = the row that holds the first PARTY COUNT control.
      const anchor = document.querySelector<HTMLElement>('[name="line_party_count"]');
      const tr = anchor?.closest("tr");

      if (tr && fill) {
        const set = (name: string, v: string) => {
          const el = tr.querySelector<HTMLInputElement>(`[name="${name}"]`);
          if (!el) return;
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        for (const k of ["line_count", "line_count_desc", "line_brand", "line_rate"]) {
          if (fill[k] != null && fill[k] !== "") set(k, String(fill[k]));
        }
      }

      // Jump focus into the line grid (first row's PARTY COUNT), after this event settles.
      setTimeout(() => (tr?.querySelector<HTMLElement>('[name="line_party_count"]'))?.focus(), 0);
    };
    document.addEventListener("combobox:change", onCombo);
    return () => document.removeEventListener("combobox:change", onCombo);
  }, [lineMap]);
  return null;
}
