"use client";

/** Phone shortcuts keep wide voucher grids usable without guessing where a field is. */
export function GridNavigator({ tbodyId, fields }: { tbodyId: string; fields: { name: string; label: string }[] }) {
  return <div className="flex flex-wrap items-center gap-2 mb-2 md:hidden no-print">
    <span className="text-xs text-[var(--muted)]">Swipe the grid, or jump to:</span>
    {fields.map(field => <button key={field.name} type="button" className="btn btn-outline btn-sm min-h-10" onClick={() => {
      const body = document.getElementById(tbodyId);
      const input = body?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${field.name}"]`);
      const container = body?.closest<HTMLElement>(".overflow-x-auto");
      if (input && container) container.scrollTo({ left: container.scrollLeft + input.getBoundingClientRect().left - container.getBoundingClientRect().left - 12, behavior: "smooth" });
    }}>{field.label}</button>)}
  </div>;
}
