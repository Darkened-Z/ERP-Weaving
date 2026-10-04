"use client";

import { useEffect } from "react";

export function AutoSubmit({ watch }: { watch: string }) {
  useEffect(() => {
    const handler = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t || t.name !== watch) return;
      if (!t.value?.trim()) return;
      const form = t.closest("form");
      if (!form) return;
      const flag = document.createElement("input");
      flag.type = "hidden";
      flag.name = "_auto_save";
      flag.value = "1";
      form.appendChild(flag);
      form.requestSubmit();
      setTimeout(() => flag.remove(), 0);
    };
    document.addEventListener("change", handler, true);
    return () => document.removeEventListener("change", handler, true);
  }, [watch]);
  return null;
}
