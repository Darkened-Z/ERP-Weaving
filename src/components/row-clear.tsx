"use client";

export function RowClear() {
  return (
    <button
      type="button"
      className="text-[var(--muted)] hover:text-red-600 text-[14px] leading-none px-0.5"
      title="Clear this row"
      onClick={(e) => {
        const tr = (e.target as HTMLElement).closest("tr");
        if (!tr) return;
        if (!window.confirm("Clear this row?")) return;
        tr.querySelectorAll<HTMLInputElement>("input").forEach((el) => {
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
        });
        tr.querySelectorAll<HTMLSelectElement>("select").forEach((el) => {
          el.value = "";
          el.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }}
    >
      &times;
    </button>
  );
}
