"use client";

import { useEffect } from "react";

/**
 * Fills a text field from a plain <select>. AutoFill only listens for
 * `combobox:change`, and the Dsp. Quality picker here is a native select — so
 * choosing a construction code left the Grey Construction line blank and the
 * operator had to retype the reed x pick and counts by hand.
 */
export function SelectFill({
  watch,
  target,
  map,
}: {
  watch: string;
  target: string;
  map: Record<string, string>;
}) {
  useEffect(() => {
    const onChange = (e: Event) => {
      const el = e.target as HTMLSelectElement | null;
      if (!el || el.name !== watch) return;
      const dest = document.querySelector<HTMLInputElement>(`[name="${target}"]`);
      if (!dest) return;
      dest.value = map[el.value] ?? "";
      dest.dispatchEvent(new Event("input", { bubbles: true }));
      dest.dispatchEvent(new Event("change", { bubbles: true }));
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [watch, target, map]);
  return null;
}
