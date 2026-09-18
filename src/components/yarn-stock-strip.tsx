"use client";

import { useEffect, useState } from "react";

export type YarnStock = {
  /** Lbs lying. Bags are derived: the mill counts 100 lbs to a bag. */
  lbs: number | null;
  rate: number | null;
  label: string;
};

const fmt = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

/**
 * What the picked count (purchase) or batch (sale) has lying in the godown —
 * the yarn twin of the Packi Parchi quality strip. There the stock coming out
 * of grey purchasing is measured in METERS; yarn is measured in BAGS and LBS,
 * so the same three questions ("how much is there, at what rate") are answered
 * in the units this side of the mill actually uses.
 *
 * It follows whichever row the operator last picked in, because the count lives
 * on the line, not in the header. One strip for the whole grid keeps it
 * readable on a phone, where a per-row strip would bury the grid.
 */
export function YarnStockStrip({
  stock,
  watch,
  initialCode = "",
  unitLabel = "count",
}: {
  stock: Record<string, YarnStock>;
  /** Field name on each grid row that identifies the stock — line_count, line_stock_key… */
  watch: string;
  initialCode?: string;
  unitLabel?: string;
}) {
  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      const d = (e as CustomEvent).detail as { name?: string; value?: string } | undefined;
      if ((t?.name ?? d?.name) !== watch) return;
      setCode((d?.value ?? t?.value ?? "").trim());
    };
    document.addEventListener("change", onChange, true);
    document.addEventListener("combobox:change", onChange, true);
    return () => {
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("combobox:change", onChange, true);
    };
  }, [watch]);

  const s = stock[code];
  const bags = s?.lbs != null ? s.lbs / 100 : null;
  const value = s && s.lbs != null && s.rate != null ? Math.round(s.lbs * s.rate) : null;

  return (
    <div className="flex flex-wrap items-stretch gap-0 border border-black mb-3">
      <div className="px-3 py-1.5 bg-black text-white text-[10px] uppercase tracking-[0.12em] font-semibold flex items-center">
        In Stock
      </div>
      {([
        ["Bags", fmt(bags)],
        ["Lbs", fmt(s?.lbs)],
        ["Rate", fmt(s?.rate)],
        ["Stock Value", fmt(value)],
      ] as [string, string][]).map(([k, v]) => (
        <div key={k} className="px-3 py-1.5 border-l border-black flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{k}</span>
          <span className="mono text-[13px] font-bold">{v}</span>
        </div>
      ))}
      <div className="px-3 py-1.5 border-l border-black flex items-center text-[10px] text-[var(--muted)]">
        {s?.label || (code ? code : `pick a ${unitLabel} to see what is lying`)}
      </div>
    </div>
  );
}
