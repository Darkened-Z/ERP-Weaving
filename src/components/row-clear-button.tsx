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
        row?.querySelectorAll<HTMLInputElement>("input, select, textarea").forEach((el) => {
          if (el.type === "checkbox" || el.type === "radio") {
            (el as HTMLInputElement).checked = false;
          } else {
            el.value = "";
          }
        });
      }}
    >
      X
    </button>
  );
}
