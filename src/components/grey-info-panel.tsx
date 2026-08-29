"use client";

import { useEffect, useState } from "react";

type GreyInfo = {
  reed: number | null;
  pick: number | null;
  width: number | null;
  warpCounts: string[];
  weftCounts: string[];
};

/**
 * Compact "As information" panel next to the Gray Qlty Code picker.
 * Shows the picked construction's Reed × Pick and each warp / weft pair
 * from the master, so the operator can eyeball the spec instead of
 * navigating to Grey Construction master.
 *
 * The underlying form still submits read / pick / width / warp_count_N /
 * weft_count_N via hidden inputs (populated by <AutoFill>).
 */
export function GreyInfoPanel({
  watch,
  map,
}: {
  watch: string;
  map: Record<string, GreyInfo>;
}) {
  const [key, setKey] = useState("");

  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>(`input[name="${watch}"]`);
    if (el?.value) setKey(el.value);
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      // Combobox dispatches custom event with detail.value
      const detail = (e as CustomEvent).detail as { value?: string } | undefined;
      const nameMatches = t?.name === watch || t?.getAttribute?.("name") === watch;
      if (nameMatches) {
        setKey((detail?.value ?? t?.value ?? "").trim());
      }
    };
    document.addEventListener("combobox:change", onChange, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("input", onChange, true);
    return () => {
      document.removeEventListener("combobox:change", onChange, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("input", onChange, true);
    };
  }, [watch]);

  const info = map[key];
  if (!info) {
    return (
      <div className="border border-dashed border-[var(--muted)] px-3 py-2 mono text-[11px] text-[var(--muted)] italic">
        Pick a Gray Qlty Code to see details
      </div>
    );
  }
  const pairs = Math.max(info.warpCounts.filter(Boolean).length, info.weftCounts.filter(Boolean).length);
  return (
    <div className="border border-black bg-[#fdf3f5] mono text-[11px]">
      <div className="grid grid-cols-[100px_1fr_1fr] border-b border-black bg-[#f3d4d9]">
        <div className="px-2 py-1 font-bold uppercase">Gray Code</div>
        <div className="px-2 py-1 text-right font-bold">{key}</div>
        <div className="px-2 py-1 text-right font-bold">{info.reed ?? "-"} <span className="opacity-60">×</span> {info.pick ?? "-"}</div>
      </div>
      {pairs === 0 ? (
        <div className="px-2 py-2 text-[var(--muted)] italic">No warp/weft rows in this construction</div>
      ) : (
        Array.from({ length: pairs }).map((_, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr] border-b border-black last:border-b-0 hover:bg-white">
            <div className="px-2 py-1">{info.warpCounts[i] ?? ""}</div>
            <div className="px-2 py-1 opacity-60">×</div>
            <div className="px-2 py-1 text-right">{info.weftCounts[i] ?? ""}</div>
          </div>
        ))
      )}
    </div>
  );
}
