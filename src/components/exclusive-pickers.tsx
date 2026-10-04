"use client";

import { useEffect } from "react";

export function ExclusivePickers({ fields }: { fields: string[] }) {
  useEffect(() => {
    const handler = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t?.name || !fields.includes(t.name)) return;
      if (!t.value?.trim()) return;
      for (const f of fields) {
        if (f === t.name) continue;
        const el = document.querySelector<HTMLInputElement>(`input[name="${f}"]`);
        if (el && el.value) el.dispatchEvent(new Event("picker:clear"));
      }
    };
    document.addEventListener("change", handler, true);
    return () => document.removeEventListener("change", handler, true);
  }, [fields]);
  return null;
}
