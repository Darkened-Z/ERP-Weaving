"use client";

import { useEffect, useRef, useState } from "react";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

export function JvBalanceBar({
  initialDr = 0,
  initialCr = 0,
}: {
  initialDr?: number;
  initialCr?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dr, setDr] = useState(initialDr);
  const [cr, setCr] = useState(initialCr);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const form = node.closest("form");
    if (!form) return;
    const recalc = () => {
      let d = 0;
      let c = 0;
      form
        .querySelectorAll<HTMLInputElement>('input[name="dr"]')
        .forEach((el) => {
          const n = parseFloat(el.value);
          if (Number.isFinite(n)) d += n;
        });
      form
        .querySelectorAll<HTMLInputElement>('input[name="cr"]')
        .forEach((el) => {
          const n = parseFloat(el.value);
          if (Number.isFinite(n)) c += n;
        });
      setDr(d);
      setCr(c);
      return { d, c };
    };

    const onSubmit = (e: SubmitEvent) => {
      const { d, c } = recalc();
      const emptyTotals = Math.abs(d) < 0.005 && Math.abs(c) < 0.005;
      if (emptyTotals) {
         e.preventDefault();
         alert("Cannot save an empty voucher.");
         return;
      }
      if (Math.abs(d - c) > 0.01) {
         e.preventDefault();
         alert("Debit and Credit totals do not match! A journal voucher must balance before it can be saved.\n\nPlease adjust your Dr/Cr amounts.");
         return;
      }
    };

    form.addEventListener("input", recalc);
    form.addEventListener("submit", onSubmit);
    recalc();
    return () => {
       form.removeEventListener("input", recalc);
       form.removeEventListener("submit", onSubmit);
    };
  }, []);

  const diff = dr - cr;
  const balanced = Math.abs(diff) < 0.01;

  return (
    <div ref={ref} className="flex items-end gap-3 flex-wrap">
      <div>
        <label className="label block mb-1">Total Dr</label>
        <input
          readOnly
          tabIndex={-1}
          value={fmt(dr)}
          className="input-box mono text-right bg-gray-100 font-bold"
          style={{ width: 150 }}
        />
      </div>
      <div>
        <label className="label block mb-1">Total Cr</label>
        <input
          readOnly
          tabIndex={-1}
          value={fmt(cr)}
          className="input-box mono text-right bg-gray-100 font-bold"
          style={{ width: 150 }}
        />
      </div>
      <div>
        <label className="label block mb-1">Balance Amount</label>
        <input
          readOnly
          tabIndex={-1}
          value={balanced ? fmt(dr) : fmt(diff)}
          className="input-box mono text-right font-bold"
          style={{
            width: 170,
            color: balanced ? undefined : "var(--danger)",
            borderColor: balanced ? undefined : "var(--danger)",
            background: balanced ? undefined : "#fff5f5",
          }}
        />
      </div>
      <div
        className="pb-2 mono text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: balanced ? "var(--muted)" : "var(--danger)" }}
      >
        {balanced ? "Balanced" : "Out of balance"}
      </div>
    </div>
  );
}
