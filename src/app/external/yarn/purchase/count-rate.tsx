"use client";

import { useEffect } from "react";

/** Refresh negotiated rates on a party/count change, never just on opening a voucher. */
export function YarnPurchaseCountRate({ ratesByParty, countFields }: {
  ratesByParty: Record<string, Record<string, number>>;
  countFields: Record<string, Record<string, string | number>>;
}) {
  useEffect(() => {
    const grid = document.getElementById("ypv-line-rows");
    const form = grid?.closest("form");
    if (!grid || !form) return;
    let party = form.querySelector<HTMLInputElement>('[name="party"]')?.value.trim() ?? "";
    let filling = false;
    const field = (row: Element, name: string) =>
      row.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
    const write = (row: Element, name: string, value: string) => {
      const el = field(row, name);
      if (!el || el.value === value) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const fillRate = (row: Element, count: string, preserveIfMissing = false) => {
      const rate = row.querySelector<HTMLInputElement>('[name="line_rate"]');
      if (!rate || rate.readOnly || rate.disabled) return;
      const value = ratesByParty[party]?.[count];
      // Keep the entered price when the new party has no negotiated rate.
      if (value == null && preserveIfMissing) return;
      write(row, "line_rate", value == null ? "" : String(value));
      // RowCalc recalculates a numeric rate, but deliberately ignores blanks.
      if (value == null) write(row, "line_amt", "");
    };
    const changeParty = (value: string) => {
      const next = value.trim();
      if (next === party) return;
      party = next;
      for (const row of grid.querySelectorAll("tr")) {
        const count = field(row, "line_count")?.value.trim() ?? "";
        if (count) fillRate(row, count, true);
      }
    };
    const onChange = (event: Event) => {
      const source = event.target;
      if (!(source instanceof HTMLInputElement || source instanceof HTMLSelectElement)) return;
      if (source.form !== form || filling) return;
      if (source.name === "party") {
        changeParty(source.value);
        return;
      }
      if (source.name !== "line_party_count" && source.name !== "line_count") return;
      const row = source.closest("tr");
      if (!row || !grid.contains(row)) return;
      if (row.querySelector<HTMLInputElement>('[name="line_rate"]')?.readOnly) return;
      const count = source.value.trim();
      filling = true;
      try {
        // Keep the submitted count and its description in step with the pick,
        // even if the previous count already filled both fields.
        write(row, "line_count_desc", String(countFields[count]?.line_count_desc ?? ""));
        if (source.name === "line_party_count") write(row, "line_count", count);
        else write(row, "line_party_count", count);
        fillRate(row, count);
      } finally {
        filling = false;
      }
    };
    const onParty = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; value?: string }>).detail;
      // Combobox events arrive before React updates the hidden party input.
      if (detail?.name === "party") changeParty(detail.value ?? "");
    };
    form.addEventListener("change", onChange);
    document.addEventListener("combobox:change", onParty);
    document.addEventListener("combobox:set", onParty);
    return () => {
      form.removeEventListener("change", onChange);
      document.removeEventListener("combobox:change", onParty);
      document.removeEventListener("combobox:set", onParty);
    };
  }, [ratesByParty, countFields]);
  return null;
}
