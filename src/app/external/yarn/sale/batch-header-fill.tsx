"use client";

import { useEffect } from "react";

export type BatchHeader = {
  /** Balance lying on the batch. Bags are derived at 100 lbs to a bag. */
  lbs: number;
  con: number;
  /** What the batch was purchased at — the PV (purchase voucher) rate. */
  rate: number;
};

/**
 * Carry the picked batch up into the header: Stock Bag / Con / Lbs, Rate PV,
 * Amt PV, Avg Rate — and keep P/L in step as the selling rate is typed.
 *
 * The operator picks a batch down in the grid and needs the stock and the
 * purchase rate in front of them at the top, where the voucher's own totals
 * live, without opening a report to find what the yarn cost.
 *
 * P/L is the honest one: what this voucher sells the yarn for, minus what the
 * batches it is drawing on actually cost. Summed over every row that names a
 * batch, so a multi-batch voucher still answers the question.
 */
export function BatchHeaderFill({ map }: { map: Record<string, BatchHeader> }) {
  useEffect(() => {
    const set = (name: string, v: string) => {
      const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (!el || el.value === v) return;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const n2 = (n: number) => String(Math.round(n * 100) / 100);

    const rowsWithBatch = () =>
      Array.from(document.querySelectorAll<HTMLInputElement>('[name="line_batch_no"]'))
        .map((b) => {
          const tr = b.closest("tr");
          const num = (f: string) => Number(tr?.querySelector<HTMLInputElement>(`[name="${f}"]`)?.value || 0);
          return { batch: b.value.trim(), lbs: num("line_lbs"), rate: num("line_rate") };
        })
        .filter((r) => r.batch && map[r.batch]);

    // P/L = sale value - what those same batches cost.
    const recomputePl = () => {
      const rows = rowsWithBatch();
      if (rows.length === 0) return;
      const pl = rows.reduce((s, r) => s + r.lbs * (r.rate - map[r.batch].rate), 0);
      set("pl", n2(pl));
    };

    const onPick = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      const d = (e as CustomEvent).detail as { name?: string; value?: string } | undefined;
      if ((t?.name ?? d?.name) !== "line_stock_key") return;
      const b = map[(d?.value ?? t?.value ?? "").trim()];
      if (!b) return;
      set("stock_bag", n2(b.lbs / 100));
      set("stock_con", n2(b.con));
      set("stock_lbs", n2(b.lbs));
      set("rate_pv", n2(b.rate));
      set("amt_pv", n2(b.lbs * b.rate));
      set("avg_rate", n2(b.rate));
      recomputePl();
    };

    const onEdit = (e: Event) => {
      const n = (e.target as HTMLInputElement | null)?.name;
      if (n === "line_rate" || n === "line_qty" || n === "line_lbs") recomputePl();
    };

    // Re-derive the header from the LIVE batch whenever a saved voucher is
    // opened. The purchase behind a sale gets corrected — a rate typed as 300
    // that was really 305 — and these boxes were snapshots taken at pick time,
    // so the sale would have gone on quoting the old cost and the old profit
    // for ever. The batch is the one source of truth for what yarn cost; the
    // sale's own rate (what it sold for) is never touched.
    const reconcile = () => {
      const rows = rowsWithBatch();
      if (rows.length === 0) return;
      const b = map[rows[rows.length - 1].batch];
      if (b) {
        set("stock_bag", n2(b.lbs / 100));
        set("stock_con", n2(b.con));
        set("stock_lbs", n2(b.lbs));
        set("rate_pv", n2(b.rate));
        set("amt_pv", n2(b.lbs * b.rate));
        set("avg_rate", n2(b.rate));
      }
      recomputePl();
    };
    reconcile();

    document.addEventListener("change", onPick, true);
    document.addEventListener("combobox:change", onPick, true);
    document.addEventListener("input", onEdit, true);
    return () => {
      document.removeEventListener("change", onPick, true);
      document.removeEventListener("combobox:change", onPick, true);
      document.removeEventListener("input", onEdit, true);
    };
  }, [map]);
  return null;
}
