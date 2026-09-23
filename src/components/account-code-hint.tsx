"use client";

import { useEffect } from "react";

/**
 * Print the picked account's CODE under the box that shows its name.
 *
 * The entry screens used to give a row two columns — the code in one and the
 * title in another — which is a lot of width for something nobody types. The
 * name is what the operator is looking for, so it goes in the box; the code
 * sits under it in small type, there to confirm the right account was hit
 * rather than to be read.
 *
 * The Combobox keeps the code in a hidden input and fires a native change on
 * it, so following that is enough for both a saved row and a fresh pick.
 */
export function AccountCodeHint({ field }: { field: string }) {
  useEffect(() => {
    const paint = () => {
      for (const el of document.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${field}"]`)) {
        const cell = el.closest("td") ?? el.parentElement;
        const hint = cell?.querySelector<HTMLElement>("[data-code-hint]");
        if (hint) hint.textContent = (el.value ?? "").trim();
      }
    };
    paint();
    const onChange = (e: Event) => {
      if ((e.target as HTMLInputElement | null)?.name === field) paint();
    };
    document.addEventListener("change", onChange, true);
    document.addEventListener("input", onChange, true);
    return () => {
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("input", onChange, true);
    };
  }, [field]);

  return null;
}
