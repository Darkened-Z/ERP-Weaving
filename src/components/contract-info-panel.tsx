"use client";

import { useEffect, useState } from "react";

type Info = { label: string; value: string }[];

/**
 * Read-only panel that fills the spare space beside the entry fields with the
 * details of the picked contract (party, quality, read×pick×width, warp/weft,
 * conv/gray rate, qty, date…). Updates live when the watched contract field changes.
 */
export function ContractInfoPanel({
  watch = "cont_no",
  map,
  title = "CONTRACT INFO",
}: {
  watch?: string;
  map: Record<string, Info>;
  title?: string;
}) {
  const [rows, setRows] = useState<Info | null>(null);

  useEffect(() => {
    const apply = (v: string) => setRows(map[v] ?? null);
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string } | undefined;
      const t = e.target as HTMLInputElement | null;
      if ((d?.name ?? t?.name) === watch) apply((d?.value ?? t?.value ?? "").trim());
    };
    // initial (edit mode: field already has a value)
    const el = document.querySelector<HTMLInputElement>(`[name="${watch}"]`);
    if (el?.value) apply(el.value.trim());
    document.addEventListener("combobox:change", onChange, true);
    document.addEventListener("change", onChange, true);
    return () => {
      document.removeEventListener("combobox:change", onChange, true);
      document.removeEventListener("change", onChange, true);
    };
  }, [watch, map]);

  return (
    <div className="border border-black bg-[var(--surface-2,#eef0f4)] px-3 py-2">
      <div className="mono text-[10px] font-bold tracking-wide mb-1.5 text-[var(--muted)]">{title}</div>
      {!rows ? (
        <div className="mono text-[11px] text-[var(--muted)] italic">Pick a contract to see its details…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col border-b border-[var(--border-light)] pb-0.5">
              <span className="mono text-[9px] uppercase tracking-wide text-[var(--muted)]">{r.label}</span>
              <span className="mono text-[12px]">{r.value || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
