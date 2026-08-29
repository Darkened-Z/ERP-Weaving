"use client";

import { useEffect } from "react";

type Opt = { code: string; label: string };

/**
 * Filters every `<select name="{selectName}">` (one per line row) to show only
 * the header party's counts (from party_counts). When no party is selected, or
 * the party has no defined counts, it falls back to the full count list.
 *
 * Rebuilds on party change. Preserves each select's current value if it's still
 * a valid option.
 */
export function PartyCountSelectFilter({
  partyField = "party",
  selectName = "line_party_count",
  countsByParty,
  allCounts,
}: {
  partyField?: string;
  selectName?: string;
  countsByParty: Record<string, Opt[]>;
  allCounts: Opt[];
}) {
  useEffect(() => {
    const partyEl = () => document.querySelector<HTMLInputElement>(`input[name="${partyField}"]`);
    const optsFor = (desc: string) => {
      const d = (desc ?? "").trim();
      const list = d ? countsByParty[d] : undefined;
      return list && list.length ? list : allCounts;
    };
    const rebuild = (desc: string) => {
      const opts = optsFor(desc);
      document.querySelectorAll<HTMLSelectElement>(`select[name="${selectName}"]`).forEach((sel) => {
        const keep = sel.value;
        sel.innerHTML = "";
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "—";
        sel.appendChild(blank);
        let hasKeep = false;
        for (const o of opts) {
          const el = document.createElement("option");
          el.value = o.code;
          el.textContent = o.label;
          if (o.code === keep) hasKeep = true;
          sel.appendChild(el);
        }
        sel.value = hasKeep ? keep : "";
      });
    };

    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      const detail = (e as CustomEvent).detail as { value?: string; name?: string } | undefined;
      const name = t?.name ?? detail?.name;
      if (name !== partyField) return;
      rebuild((detail?.value ?? partyEl()?.value ?? "").trim());
    };

    rebuild((partyEl()?.value ?? "").trim());
    document.addEventListener("input", onChange, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("combobox:change", onChange, true);
    return () => {
      document.removeEventListener("input", onChange, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("combobox:change", onChange, true);
    };
  }, [partyField, selectName, countsByParty, allCounts]);

  return null;
}
