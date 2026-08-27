"use client";

import { useEffect } from "react";

/**
 * When a line-item's Count field changes, look up the effective contract's
 * ratio/blend (row-level line_cont_no first, then header contract) and append
 * it to that row's line_count_desc. Idempotent: won't re-append if already
 * present. Complements RowAutoFill which fills the base description from the
 * yarn count master.
 */
export function CountBlendEnricher({
  watchLineCount,
  descField,
  rowContractField,
  headerContractField,
  blendByContract,
}: {
  watchLineCount: string;
  descField: string;
  rowContractField: string;
  headerContractField: string;
  blendByContract: Record<string, string>;
}) {
  useEffect(() => {
    const doEnrich = (tr: HTMLElement) => {
      const descEl = tr.querySelector(`[name="${descField}"]`) as HTMLInputElement | null;
      if (!descEl) return;
      const rowContEl = tr.querySelector(`[name="${rowContractField}"]`) as HTMLInputElement | null;
      const rowCont = rowContEl?.value.trim() ?? "";
      const headerContEl = document.querySelector(`[name="${headerContractField}"]`) as HTMLInputElement | null;
      const headerCont = headerContEl?.value.trim() ?? "";
      const effective = rowCont || headerCont;
      if (!effective) return;
      const blend = blendByContract[effective];
      if (!blend) return;
      const cur = descEl.value ?? "";
      if (cur.includes(blend)) return;
      descEl.value = cur ? `${cur} ${blend}`.trim() : blend;
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (!t || !t.name) return;
      // If the count changed in a row, enrich that row.
      if (t.name === watchLineCount) {
        const tr = t.closest("tr");
        if (tr) doEnrich(tr as HTMLElement);
        return;
      }
      // If the header contract changed, enrich all rows that have a count.
      if (t.name === headerContractField) {
        document
          .querySelectorAll<HTMLInputElement>(`[name="${watchLineCount}"]`)
          .forEach((el) => {
            if (!el.value) return;
            const tr = el.closest("tr");
            if (tr) doEnrich(tr as HTMLElement);
          });
      }
    };
    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name !== headerContractField) return;
      document
        .querySelectorAll<HTMLInputElement>(`[name="${watchLineCount}"]`)
        .forEach((el) => {
          if (!el.value) return;
          const tr = el.closest("tr");
          if (tr) doEnrich(tr as HTMLElement);
        });
    };
    document.addEventListener("change", onChange, true);
    document.addEventListener("combobox:change", onCombo);
    return () => {
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("combobox:change", onCombo);
    };
  }, [watchLineCount, descField, rowContractField, headerContractField, blendByContract]);
  return null;
}
