"use client";

import { useEffect } from "react";

/**
 * Rebuilds a <datalist>'s options based on another form field's current value.
 * When `watchField` has a value, only options whose `party` matches are shown.
 * When it's empty, all unique options are shown. Falls back to all options if
 * the current party has no scoped entries (so operator isn't blocked).
 *
 * Used on Yarn Purchase / Yarn Sale to filter the Count datalist by the
 * currently-selected party using party_counts rows.
 */
type Opt = { code: string; description: string; party: string };

export function DatalistPartyFilter({
  datalistId,
  options,
  watchField,
}: {
  datalistId: string;
  options: Opt[];
  watchField: string;
}) {
  useEffect(() => {
    const rebuild = () => {
      const dl = document.getElementById(datalistId);
      if (!dl) return;
      const watchEl = document.querySelector(`[name="${watchField}"]`) as HTMLInputElement | null;
      const val = (watchEl?.value ?? "").trim();
      let chosen: Opt[];
      if (val) {
        chosen = options.filter((o) => o.party === val);
        if (chosen.length === 0) chosen = options;
      } else {
        chosen = options;
      }
      const seen = new Set<string>();
      const unique = chosen.filter((o) => {
        if (seen.has(o.code)) return false;
        seen.add(o.code);
        return true;
      });
      dl.innerHTML = unique
        .map((o) => `<option value="${escapeAttr(o.code)}">${escapeAttr(`${o.code} — ${o.description}`)}</option>`)
        .join("");
    };
    rebuild();
    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name === watchField) rebuild();
    };
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t?.name === watchField) rebuild();
    };
    document.addEventListener("combobox:change", onCombo);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    return () => {
      document.removeEventListener("combobox:change", onCombo);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
    };
  }, [datalistId, options, watchField]);
  return null;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
