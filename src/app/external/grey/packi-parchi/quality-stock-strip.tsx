"use client";

import { useEffect, useState } from "react";

export type QualityStock = {
  than: number | null;
  mtr: number | null;
  avg: number | null;
  label: string;
};

const fmt = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

/**
 * What the picked quality has lying in the godown, updated as the operator picks
 * rather than only on a saved record — on a NEW parchi the server has no quality
 * yet, so the strip used to sit empty until after the first save.
 *
 * Picking a quality also carries it into Quality Print. The two are not the same
 * field: Quality is the stock record and must not move, while Quality Print is
 * what goes on the bill and is meant to be adjusted (by typing, or F9) when the
 * cloth leaving differs a little from what stock says.
 */
export function QualityStockStrip({
  stock,
  initialCode = "",
}: {
  stock: Record<string, QualityStock>;
  initialCode?: string;
}) {
  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string } | undefined;
      if (d?.name !== "quality") return;
      const v = d.value ?? "";
      setCode(v);
      // One way only: Quality Print follows Quality, never the reverse.
      document.dispatchEvent(new CustomEvent("combobox:set", { detail: { name: "quality_print", value: v } }));
    };
    document.addEventListener("combobox:change", onChange);
    return () => document.removeEventListener("combobox:change", onChange);
  }, []);

  const s = stock[code];
  const value = s && s.mtr != null && s.avg != null ? Math.round(s.mtr * s.avg) : null;

  return (
    <div className="flex flex-wrap items-stretch gap-0 border border-black">
      <div className="px-3 py-1.5 bg-black text-white text-[10px] uppercase tracking-[0.12em] font-semibold flex items-center">
        In Stock
      </div>
      {([
        ["Than", fmt(s?.than)],
        ["Meter", fmt(s?.mtr)],
        ["Avg Rate", fmt(s?.avg)],
        ["Stock Value", fmt(value)],
      ] as [string, string][]).map(([k, v]) => (
        <div key={k} className="px-3 py-1.5 border-l border-black flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{k}</span>
          <span className="mono text-[13px] font-bold">{v}</span>
        </div>
      ))}
      <div className="px-3 py-1.5 border-l border-black flex items-center text-[10px] text-[var(--muted)]">
        {s?.label || (code ? code : "pick a quality to see its stock")}
      </div>
    </div>
  );
}
