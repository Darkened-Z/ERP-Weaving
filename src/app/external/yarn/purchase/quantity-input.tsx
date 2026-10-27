"use client";

/** Bags remain editable after a sale; the server refuses less than already sold. */
export function PurchaseQuantityInput({ value, soldLbs = 0 }: { value?: number | null; soldLbs?: number }) {
  return (
    <input
      name="line_qty"
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      className="input-box mono text-[12px] text-right"
      defaultValue={value == null ? "" : value.toFixed(2)}
      style={{ width: 110 }}
      title={soldLbs > 0 ? `Quantity can be corrected, but must cover the ${soldLbs} lbs already sold.` : "Quantity in bags, including decimals (e.g. 878.25)"}
      onBlur={(event) => {
        const input = event.currentTarget;
        if (!input.value || !Number.isFinite(input.valueAsNumber)) return;
        input.value = input.valueAsNumber.toFixed(2);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    />
  );
}
