"use client";

import { useEffect } from "react";

/**
 * Auto-fills rate fields from a (party, count) keyed map. Watches the two named
 * Comboboxes; when either is picked, looks up `map["<party>||<count>"]` with the
 * current values of both and writes the rate into every `targets` input.
 * With `onlyWhenEmpty`, a target that already has a value is left alone (so a
 * higher-priority fill, e.g. the godown avg rate, is not clobbered).
 */
export function PartyCountRate({
  partyField,
  countField,
  map,
  targets,
  onlyWhenEmpty = false,
}: {
  partyField: string;
  countField: string;
  map: Record<string, number>;
  targets: string[];
  onlyWhenEmpty?: boolean;
}) {
  useEffect(() => {
    const read = (n: string) =>
      (document.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value?.trim() ?? "";
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name !== partyField && d?.name !== countField) return;
      // The event fires before the source Combobox's hidden input updates, so the
      // changed side's value comes from the event itself, the other from the DOM.
      const party = d.name === partyField ? (d.value ?? "").trim() : read(partyField);
      const count = d.name === countField ? (d.value ?? "").trim() : read(countField);
      if (!party || !count) return;
      const rate = map[`${party}||${count}`];
      if (rate == null) return;
      for (const t of targets) {
        const el = document.querySelector(`[name="${t}"]`) as HTMLInputElement | null;
        if (!el || (onlyWhenEmpty && el.value)) continue;
        el.value = String(rate);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
    document.addEventListener("combobox:change", onChange);
    return () => document.removeEventListener("combobox:change", onChange);
  }, [partyField, countField, map, targets, onlyWhenEmpty]);
  return null;
}
