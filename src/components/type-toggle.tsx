"use client";

/**
 * Small pair of quick-set buttons for a form select. Renders one button per
 * value; clicking a button sets the referenced <select> or <input> and fires
 * its change event so any downstream AutoFill / RowAutoFill can react.
 */
export function TypeToggle({
  targetName,
  values,
}: {
  targetName: string;
  values: { label: string; value: string }[];
}) {
  const setValue = (v: string) => {
    const el = document.querySelector(`[name="${targetName}"]`) as
      | HTMLSelectElement
      | HTMLInputElement
      | null;
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  return (
    <div className="flex gap-1">
      {values.map((v) => (
        <button
          key={v.value}
          type="button"
          className="btn btn-outline btn-xs"
          style={{ minWidth: 46, padding: "2px 8px" }}
          onClick={() => setValue(v.value)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
