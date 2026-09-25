"use client";

import { useEffect, useState } from "react";

type GreyInfo = {
  reed: number | null;
  pick: number | null;
  width: number | null;
  description?: string;
  warpCounts: string[];
  weftCounts: string[];
};

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

  const warpFiltered = info.warpCounts.filter(Boolean);
  const weftFiltered = info.weftCounts.filter(Boolean);

  return (
    <div className="border border-black mono text-[11px]">
      <div className="grid grid-cols-4 border-b border-black bg-[#f3d4d9]">
        <div className="px-2 py-1">
          <span className="opacity-60 text-[10px]">CODE</span>
          <span className="ml-1 font-bold">{key}</span>
        </div>
        <div className="px-2 py-1">
          <span className="opacity-60 text-[10px]">READ</span>
          <span className="ml-1 font-bold">{info.reed ?? "-"}</span>
        </div>
        <div className="px-2 py-1">
          <span className="opacity-60 text-[10px]">PICK</span>
          <span className="ml-1 font-bold">{info.pick ?? "-"}</span>
        </div>
        <div className="px-2 py-1">
          <span className="opacity-60 text-[10px]">WIDTH</span>
          <span className="ml-1 font-bold">{info.width ? `${info.width}"` : "-"}</span>
        </div>
      </div>

      {info.description && (
        <div className="px-2 py-1 border-b border-black bg-[#fdf3f5] text-[11px]">
          {info.description}
        </div>
      )}

      {(warpFiltered.length > 0 || weftFiltered.length > 0) && (
        <div className="grid grid-cols-2">
          <div className="border-r border-black">
            <div className="px-2 py-0.5 bg-green-100 border-b border-black text-[10px] font-bold uppercase tracking-wider">Warp</div>
            {warpFiltered.length === 0 ? (
              <div className="px-2 py-1 text-[var(--muted)] italic">—</div>
            ) : (
              warpFiltered.map((w, i) => (
                <div key={i} className="px-2 py-0.5 border-b border-[var(--border-light)] last:border-b-0 bg-[#fdf3f5]">
                  {w}
                </div>
              ))
            )}
          </div>
          <div>
            <div className="px-2 py-0.5 bg-green-100 border-b border-black text-[10px] font-bold uppercase tracking-wider">Weft</div>
            {weftFiltered.length === 0 ? (
              <div className="px-2 py-1 text-[var(--muted)] italic">—</div>
            ) : (
              weftFiltered.map((w, i) => (
                <div key={i} className="px-2 py-0.5 border-b border-[var(--border-light)] last:border-b-0 bg-[#fdf3f5]">
                  {w}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {warpFiltered.length === 0 && weftFiltered.length === 0 && (
        <div className="px-2 py-2 text-[var(--muted)] italic bg-[#fdf3f5]">No warp/weft rows in this construction</div>
      )}
    </div>
  );
}
