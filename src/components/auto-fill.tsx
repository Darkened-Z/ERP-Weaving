"use client";

import { useEffect } from "react";

type Fill = Record<string, string | number | null | undefined>;

/**
 * Watches a source Combobox (identified by its `watch` name). When the user picks
 * an option there, looks up `map[value]` and fills the related header fields:
 *   - names in `combos` are pushed into other Comboboxes via the `combobox:set` event
 *   - names in `inputs` set the value of a plain input / textarea / select
 * Used e.g. on Yarn Purchase so choosing a contract fills party, broker, brokerage,
 * rate, remarks, etc.
 */
export function AutoFill({
  watch,
  map,
  combos = [],
  inputs = [],
}: {
  watch: string;
  map: Record<string, Fill>;
  combos?: string[];
  inputs?: string[];
}) {
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name !== watch) return;
      const data = map[d.value ?? ""];
      if (!data) return;
      for (const name of combos) {
        document.dispatchEvent(
          new CustomEvent("combobox:set", {
            detail: { name, value: data[name] != null ? String(data[name]) : "" },
          })
        );
      }
      for (const name of inputs) {
        const el = document.querySelector(
          `[name="${name}"]`
        ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (el && data[name] != null) {
          el.value = String(data[name]);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    };
    document.addEventListener("combobox:change", onChange);
    return () => document.removeEventListener("combobox:change", onChange);
  }, [watch, map, combos, inputs]);
  return null;
}

/**
 * Row-scoped live computation for line grids: for every <tr> in the document,
 * target = a [× b] × factor, recomputed whenever a or b in that row changes.
 * With `onlyWhenEmpty`, fills the target only if it is blank (Oracle's
 * "default lbs = bags × 100 unless typed" behavior).
 */
export function RowCalc({
  target,
  a,
  b,
  factor = 1,
  round = 2,
  onlyWhenEmpty = false,
}: {
  target: string;
  a: string;
  b?: string;
  factor?: number;
  round?: number;
  onlyWhenEmpty?: boolean;
}) {
  useEffect(() => {
    const onInput = (e: Event) => {
      const src = e.target as HTMLInputElement;
      if (!src?.name || (src.name !== a && src.name !== b)) return;
      const tr = src.closest("tr");
      if (!tr) return;
      const t = tr.querySelector<HTMLInputElement>(`[name="${target}"]`);
      if (!t || (onlyWhenEmpty && t.value)) return;
      const av = parseFloat(tr.querySelector<HTMLInputElement>(`[name="${a}"]`)?.value ?? "");
      const bv = b ? parseFloat(tr.querySelector<HTMLInputElement>(`[name="${b}"]`)?.value ?? "") : 1;
      if (!Number.isFinite(av) || !Number.isFinite(bv)) return;
      const p = 10 ** round;
      t.value = String(Math.round(av * bv * factor * p) / p);
      t.dispatchEvent(new Event("input", { bubbles: true }));
    };
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, [target, a, b, factor, round, onlyWhenEmpty]);
  return null;
}

/**
 * Per-row auto-fill for line grids. When an input named `watch` inside a <tr>
 * changes, fills sibling inputs in the same row from `map[value]`
 * (keys of the fill object = sibling input names). Only fills empty siblings,
 * so a manually edited row is not clobbered.
 */
export function RowAutoFill({ watch, map }: { watch: string; map: Record<string, Fill> }) {
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (!t || t.name !== watch) return;
      const data = map[t.value.trim()];
      if (!data) return;
      const tr = t.closest("tr");
      if (!tr) return;
      for (const [name, v] of Object.entries(data)) {
        const el = tr.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        if (el && !el.value && v != null && v !== "") el.value = String(v);
      }
    };
    document.addEventListener("change", onChange, true);
    return () => document.removeEventListener("change", onChange, true);
  }, [watch, map]);
  return null;
}
