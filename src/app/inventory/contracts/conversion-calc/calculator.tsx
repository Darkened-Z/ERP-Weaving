"use client";

import { useState, useMemo } from "react";

const parseNum = (s: string): number => {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const formatNum = (n: number, digits = 4): string => {
  if (!Number.isFinite(n) || n === 0) return "0";
  return new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(n);
};

const LOOM_TYPES = ["SULZER", "RAPIER", "AIRJET", "PROJECTILE"];

export function ConversionCalculator() {
  const [warpCount, setWarpCount] = useState("");
  const [ends, setEnds] = useState("");
  const [warpCostPerLbs, setWarpCostPerLbs] = useState("");

  const [weftCount, setWeftCount] = useState("");
  const [picks, setPicks] = useState("");
  const [weftCostPerLbs, setWeftCostPerLbs] = useState("");

  const [read, setRead] = useState("");
  const [pick, setPick] = useState("");
  const [width, setWidth] = useState("");
  const [loomType, setLoomType] = useState("SULZER");

  const [copied, setCopied] = useState(false);

  const outputs = useMemo(() => {
    const wCount = parseNum(warpCount);
    const wEnds = parseNum(ends);
    const wCost = parseNum(warpCostPerLbs);

    const fCount = parseNum(weftCount);
    const fPicks = parseNum(picks);
    const fCost = parseNum(weftCostPerLbs);

    const w = parseNum(width);

    const warpWt = wCount > 0 ? (wEnds * w * 39.37 * 0.5905) / (wCount * 840) : 0;
    const weftWt = fCount > 0 ? (fPicks * w * 39.37 * 0.5905) / (fCount * 840) : 0;
    const totalWt = warpWt + weftWt;

    const warpCostPerMtr = (warpWt * wCost) / 2.2046;
    const weftCostPerMtr = (weftWt * fCost) / 2.2046;
    const totalCostPerMtr = warpCostPerMtr + weftCostPerMtr;

    return {
      warpWt,
      weftWt,
      totalWt,
      warpCostPerMtr,
      weftCostPerMtr,
      totalCostPerMtr,
    };
  }, [warpCount, ends, warpCostPerLbs, weftCount, picks, weftCostPerLbs, width]);

  const handleCopy = async () => {
    const block = [
      "GREY CONVERSION CALCULATOR",
      "==========================",
      "",
      "INPUTS",
      "------",
      `Warp Count:            ${warpCount || "-"}`,
      `Warp Ends:             ${ends || "-"}`,
      `Warp Cost/Lbs:         ${warpCostPerLbs || "-"}`,
      `Weft Count:            ${weftCount || "-"}`,
      `Weft Picks/inch:       ${picks || "-"}`,
      `Weft Cost/Lbs:         ${weftCostPerLbs || "-"}`,
      `Read:                  ${read || "-"}`,
      `Pick:                  ${pick || "-"}`,
      `Width (inches):        ${width || "-"}`,
      `Loom Type:             ${loomType}`,
      "",
      "OUTPUTS",
      "-------",
      `Warp WT per Mtr:       ${formatNum(outputs.warpWt)}`,
      `Weft WT per Mtr:       ${formatNum(outputs.weftWt)}`,
      `Total WT per Mtr:      ${formatNum(outputs.totalWt)}`,
      `Warp Cost per Mtr:     ${formatNum(outputs.warpCostPerMtr)}`,
      `Weft Cost per Mtr:     ${formatNum(outputs.weftCostPerMtr)}`,
      `Total Cost per Mtr:    ${formatNum(outputs.totalCostPerMtr)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="animate-in">
      <div className="mb-6">
        <h1 className="page-title">Grey Conversion Calculator</h1>
        <p className="text-[13px] text-[var(--muted)] mt-2">
          Client-side utility. No data is saved.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-black p-6">
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
            Inputs
          </div>

          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 text-[var(--muted)]">
              Warp
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label block mb-1">Count</label>
                <input
                  type="text"
                  className="input-box mono"
                  value={warpCount}
                  onChange={(e) => setWarpCount(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Ends</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={ends}
                  onChange={(e) => setEnds(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Cost/Lbs</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={warpCostPerLbs}
                  onChange={(e) => setWarpCostPerLbs(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 text-[var(--muted)]">
              Weft
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label block mb-1">Count</label>
                <input
                  type="text"
                  className="input-box mono"
                  value={weftCount}
                  onChange={(e) => setWeftCount(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Picks per inch</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={picks}
                  onChange={(e) => setPicks(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Cost/Lbs</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={weftCostPerLbs}
                  onChange={(e) => setWeftCostPerLbs(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 text-[var(--muted)]">
              Fabric
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1">Read</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={read}
                  onChange={(e) => setRead(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Pick</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Width (inches)</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Loom Type</label>
                <select
                  className="input-box"
                  value={loomType}
                  onChange={(e) => setLoomType(e.target.value)}
                >
                  {LOOM_TYPES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-black p-6">
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
            Outputs
          </div>

          <div className="space-y-3">
            <div className="border border-black p-3">
              <div className="flex justify-between items-baseline gap-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  Warp WT per Mtr
                </div>
                <div className="mono text-lg font-bold">{formatNum(outputs.warpWt)}</div>
              </div>
              <div className="text-[10px] text-[var(--muted)] mono mt-1">
                (ends x width x 39.37 x 0.5905) / (warp_count x 840)
              </div>
            </div>

            <div className="border border-black p-3">
              <div className="flex justify-between items-baseline gap-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  Weft WT per Mtr
                </div>
                <div className="mono text-lg font-bold">{formatNum(outputs.weftWt)}</div>
              </div>
              <div className="text-[10px] text-[var(--muted)] mono mt-1">
                (picks x width x 39.37 x 0.5905) / (weft_count x 840)
              </div>
            </div>

            <div className="border-2 border-black p-3 bg-black text-white">
              <div className="flex justify-between items-baseline gap-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  Total WT per Mtr
                </div>
                <div className="mono text-lg font-bold">{formatNum(outputs.totalWt)}</div>
              </div>
              <div className="text-[10px] text-gray-300 mono mt-1">
                warp_wt + weft_wt
              </div>
            </div>

            <div className="border border-black p-3">
              <div className="flex justify-between items-baseline gap-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  Warp Cost per Mtr
                </div>
                <div className="mono text-lg font-bold">{formatNum(outputs.warpCostPerMtr)}</div>
              </div>
              <div className="text-[10px] text-[var(--muted)] mono mt-1">
                warp_wt x warp_cost_per_lbs / 2.2046
              </div>
            </div>

            <div className="border border-black p-3">
              <div className="flex justify-between items-baseline gap-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  Weft Cost per Mtr
                </div>
                <div className="mono text-lg font-bold">{formatNum(outputs.weftCostPerMtr)}</div>
              </div>
              <div className="text-[10px] text-[var(--muted)] mono mt-1">
                weft_wt x weft_cost_per_lbs / 2.2046
              </div>
            </div>

            <div className="border-2 border-black p-3 bg-black text-white">
              <div className="flex justify-between items-baseline gap-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  Total Cost per Mtr
                </div>
                <div className="mono text-lg font-bold">{formatNum(outputs.totalCostPerMtr)}</div>
              </div>
              <div className="text-[10px] text-gray-300 mono mt-1">
                warp_cost + weft_cost
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={handleCopy} className="btn btn-sm">
              Copy to Clipboard
            </button>
            {copied && (
              <span className="text-[11px] mono text-[var(--muted)]">Copied.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
