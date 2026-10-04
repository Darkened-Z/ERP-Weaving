"use client";

import { useEffect } from "react";

export function AutoSubmit({ watch }: { watch: string }) {
  useEffect(() => {
    const handler = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t || t.name !== watch) return;
      if (!t.value?.trim()) return;
      const form = t.closest("form");
      if (form) form.requestSubmit();
    };
    document.addEventListener("change", handler, true);
    return () => document.removeEventListener("change", handler, true);
  }, [watch]);
  return null;
}
