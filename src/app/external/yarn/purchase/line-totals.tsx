"use client";

import { useEffect, useRef } from "react";

const quantityFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const weightFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

/** Totals follow every row, including saved rows and rows revealed by GrowRows. */
export function PurchaseLineTotals({ initialQty, initialLbs }: { initialQty: number; initialLbs: number }) {
  const qtyRef = useRef<HTMLTableCellElement>(null);
  const lbsRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    const body = document.getElementById("ypv-line-rows");
    if (!body) return;
    const sum = (name: string) => Array.from(body.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
      .reduce((total, input) => total + (Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0), 0);
    const update = () => {
      if (qtyRef.current) qtyRef.current.textContent = quantityFormat.format(sum("line_qty"));
      if (lbsRef.current) lbsRef.current.textContent = weightFormat.format(sum("line_lbs"));
    };
    const onInput = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && body.contains(target) && (target.name === "line_qty" || target.name === "line_lbs")) update();
    };
    update();
    body.addEventListener("input", onInput);
    body.addEventListener("change", onInput);
    return () => {
      body.removeEventListener("input", onInput);
      body.removeEventListener("change", onInput);
    };
  }, []);

  return <tfoot>
    <tr className="font-bold bg-gray-100">
      <th colSpan={11} scope="row" className="text-right">Total</th>
      <td ref={qtyRef} aria-label="Total quantity" className="mono text-right">{quantityFormat.format(initialQty)}</td>
      <td ref={lbsRef} aria-label="Total pounds" className="mono text-right">{weightFormat.format(initialLbs)}</td>
      <td colSpan={3} />
    </tr>
  </tfoot>;
}
