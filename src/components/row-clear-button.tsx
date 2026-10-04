"use client";

export function RowClearButton() {
  return (
    <button
      type="button"
      className="mono text-[11px] text-[var(--muted)] hover:text-black no-print"
      title="Clear row"
      aria-label="Clear row"
      onClick={(e) => {
        const row = (e.currentTarget as HTMLButtonElement).closest("tr");
        if (!row) return;
        row.querySelectorAll<HTMLInputElement>("input").forEach((inp) => {
          inp.value = "";
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        });
        row.querySelectorAll<HTMLSelectElement>("select").forEach((sel) => {
          sel.value = "";
        });
      }}
    >
      ✕
    </button>
  );
}
