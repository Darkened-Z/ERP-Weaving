"use client";

import { useEffect, useRef, useState } from "react";

export function VoucherBalance({
  initial = 0,
  fieldName = "line_amt",
}: {
  initial?: number;
  fieldName?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const form = el.closest("form");
    if (!form) return;
    const recalc = () => {
      let s = 0;
      form
        .querySelectorAll<HTMLInputElement>(`input[name="${fieldName}"]`)
        .forEach((i) => {
          const n = parseFloat(i.value);
          if (Number.isFinite(n)) s += n;
        });
      setVal(s);
    };
    form.addEventListener("input", recalc);
    recalc();
    return () => form.removeEventListener("input", recalc);
  }, [fieldName]);

  return (
    <input
      ref={ref}
      readOnly
      tabIndex={-1}
      value={new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(val)}
      className="input-box mono text-right bg-gray-100 font-bold"
    />
  );
}
