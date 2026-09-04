"use client";

import { useState, useMemo } from "react";
import { round } from "@/lib/form";

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

type Row = { count: string; ends: string; rate: string };

const emptyRow = (): Row => ({ count: "", ends: "", rate: "" });

const rowCalc = (r: Row) => {
  const cal = parseNum(r.count);
  const wt = cal > 0 ? round((parseNum(r.ends) * 1.0936 / 800) / cal, 6) : 0;
  const cost = round(wt * parseNum(r.rate), 4);
  return { wt, cost };
};

export function ConversionCalculator() {
  const [warpRows, setWarpRows] = useState<Row[]>([emptyRow()]);
  const [weftRows, setWeftRows] = useState<Row[]>([emptyRow()]);

  const [ratePerPick, setRatePerPick] = useState("");
  const [rateMtr, setRateMtr] = useState("");
  const [pick, setPick] = useState("");
  const [lakhaiMtr, setLakhaiMtr] = useState("");
  const [qtyMtr, setQtyMtr] = useState("");

  const [copied, setCopied] = useState(false);

  const outputs = useMemo(() => {
    const warp = warpRows.map(rowCalc);
    const weft = weftRows.map(rowCalc);
    const warpWt = round(warp.reduce((s, r) => s + r.wt, 0), 6);
    const weftWt = round(weft.reduce((s, r) => s + r.wt, 0), 6);
    const totalWt = round(warpWt + weftWt, 6);
    const warpCost = round(warp.reduce((s, r) => s + r.cost, 0), 4);
    const weftCost = round(weft.reduce((s, r) => s + r.cost, 0), 4);
    const totalCost = round(warpCost + weftCost, 4);

    const rpp = parseNum(ratePerPick);
    const clb = parseNum(lakhaiMtr);
    const convRate =
      rpp > 0 ? round(rpp * parseNum(pick) + clb, 4) : round(parseNum(rateMtr) + clb, 4);
    const greyRate = round(totalCost + convRate, 2);

    const qty = parseNum(qtyMtr);
    return {
      warp,
      weft,
      warpWt,
      weftWt,
      totalWt,
      warpCost,
      weftCost,
      totalCost,
      convRate,
      greyRate,
      wrpWt40: round(warpWt * 40, 6),
      wftWt40: round(weftWt * 40, 6),
      weight40: round(totalWt * 40, 6),
      qtyWt: round(totalWt * qty, 2),
      qtyConvAmount: round(convRate * qty, 2),
      qtyGreyAmount: round(greyRate * qty, 2),
    };
  }, [warpRows, weftRows, ratePerPick, rateMtr, pick, lakhaiMtr, qtyMtr]);

  const handleCopy = async () => {
    const rowLines = (label: string, rows: Row[], calc: { wt: number; cost: number }[]) =>
      rows
        .map(
          (r, i) =>
            `${label} ${i + 1}: count=${r.count || "-"} ends=${r.ends || "-"} rate/lbs=${r.rate || "-"} wt=${formatNum(calc[i].wt, 6)} cost=${formatNum(calc[i].cost)}`
        )
        .join("\n");
    const block = [
      "GREY CONVERSION CALCULATOR",
      "==========================",
      "",
      rowLines("Warp", warpRows, outputs.warp),
      rowLines("Weft", weftRows, outputs.weft),
      "",
      `Rate/Pick:             ${ratePerPick || "-"}`,
      `Rate/Mtr:              ${rateMtr || "-"}`,
      `Pick:                  ${pick || "-"}`,
      `Lakhai/Mtr:            ${lakhaiMtr || "-"}`,
      `Qty (Mtr):             ${qtyMtr || "-"}`,
      "",
      `Warp WT per Mtr:       ${formatNum(outputs.warpWt, 6)}`,
      `Weft WT per Mtr:       ${formatNum(outputs.weftWt, 6)}`,
      `Total WT per Mtr:      ${formatNum(outputs.totalWt, 6)}`,
      `Warp Cost per Mtr:     ${formatNum(outputs.warpCost)}`,
      `Weft Cost per Mtr:     ${formatNum(outputs.weftCost)}`,
      `Total Cost per Mtr:    ${formatNum(outputs.totalCost)}`,
      `Conv Rate per Mtr:     ${formatNum(outputs.convRate)}`,
      `Grey Rate per Mtr:     ${formatNum(outputs.greyRate, 2)}`,
      `WRP Wt / 40 Mtr:       ${formatNum(outputs.wrpWt40, 6)}`,
      `WFT Wt / 40 Mtr:       ${formatNum(outputs.wftWt40, 6)}`,
      `Weight / 40 Mtr:       ${formatNum(outputs.weight40, 6)}`,
      `Qty Weight:            ${formatNum(outputs.qtyWt, 2)}`,
      `Qty Conv Amount:       ${formatNum(outputs.qtyConvAmount, 2)}`,
      `Qty Grey Amount:       ${formatNum(outputs.qtyGreyAmount, 2)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const rowsEditor = (
    label: string,
    rows: Row[],
    calc: { wt: number; cost: number }[],
    setRows: (r: Row[]) => void
  ) => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-[0.1em] font-semibold text-[var(--muted)]">
          {label}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setRows([...rows, emptyRow()])}
        >
          + Row
        </button>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-1 py-1 border-b border-black text-left">Count</th>
            <th className="px-1 py-1 border-b border-black text-left">Ends</th>
            <th className="px-1 py-1 border-b border-black text-left">Rate/Lbs</th>
            <th className="px-1 py-1 border-b border-black text-right">WT/Mtr</th>
            <th className="px-1 py-1 border-b border-black text-right">Cost/Mtr</th>
            <th className="px-1 py-1 border-b border-black" style={{ width: 26 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                <input
                  type="number"
                  step="any"
                  className="input-box mono text-[12px]"
                  value={r.count}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))
                  }
                />
              </td>
              <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                <input
                  type="number"
                  step="any"
                  className="input-box mono text-[12px]"
                  value={r.ends}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, ends: e.target.value } : x)))
                  }
                />
              </td>
              <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                <input
                  type="number"
                  step="any"
                  className="input-box mono text-[12px]"
                  value={r.rate}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))
                  }
                />
              </td>
              <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-right">
                {formatNum(calc[i].wt, 6)}
              </td>
              <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-right">
                {formatNum(calc[i].cost)}
              </td>
              <td className="px-1 py-0.5 border-b border-[var(--border-light)] text-center">
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="mono text-[11px] text-[var(--muted)] hover:text-black"
                    title="Remove row"
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
                    X
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const outLine = (label: string, value: string, formula: string, dark = false) => (
    <div className={dark ? "border-2 border-black p-3 bg-black text-white" : "border border-black p-3"}>
      <div className="flex justify-between items-baseline gap-4">
        <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">{label}</div>
        <div className="mono text-lg font-bold">{value}</div>
      </div>
      <div className={`text-[10px] mono mt-1 ${dark ? "text-gray-300" : "text-[var(--muted)]"}`}>
        {formula}
      </div>
    </div>
  );

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

          {rowsEditor("Warp", warpRows, outputs.warp, setWarpRows)}
          {rowsEditor("Weft", weftRows, outputs.weft, setWeftRows)}

          <div>
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 text-[var(--muted)]">
              Conversion
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label block mb-1">Rate/Pick</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={ratePerPick}
                  onChange={(e) => setRatePerPick(e.target.value)}
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
                <label className="label block mb-1">Rate/Mtr</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={rateMtr}
                  onChange={(e) => setRateMtr(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Lakhai/Mtr</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={lakhaiMtr}
                  onChange={(e) => setLakhaiMtr(e.target.value)}
                />
              </div>
              <div>
                <label className="label block mb-1">Qty (Mtr)</label>
                <input
                  type="number"
                  step="any"
                  className="input-box mono"
                  value={qtyMtr}
                  onChange={(e) => setQtyMtr(e.target.value)}
                />
              </div>
            </div>
            <div className="text-[10px] text-[var(--muted)] mono mt-2">
              Rate/Pick &gt; 0 uses rate_per_pick x pick + lakhai, otherwise rate_mtr + lakhai.
            </div>
          </div>
        </div>

        <div className="border border-black p-6">
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
            Outputs
          </div>

          <div className="space-y-3">
            {outLine("Warp WT per Mtr", formatNum(outputs.warpWt, 6), "sum of (ends x 1.0936 / 800) / count")}
            {outLine("Weft WT per Mtr", formatNum(outputs.weftWt, 6), "sum of (ends x 1.0936 / 800) / count")}
            {outLine("Total WT per Mtr", formatNum(outputs.totalWt, 6), "warp_wt + weft_wt", true)}
            {outLine("Warp Cost per Mtr", formatNum(outputs.warpCost), "sum of wt x rate_per_lbs")}
            {outLine("Weft Cost per Mtr", formatNum(outputs.weftCost), "sum of wt x rate_per_lbs")}
            {outLine("Total Cost per Mtr", formatNum(outputs.totalCost), "warp_cost + weft_cost", true)}
            {outLine("Conv Rate per Mtr", formatNum(outputs.convRate), "rate_per_pick x pick + lakhai (or rate_mtr + lakhai)")}
            {outLine("Grey Rate per Mtr", formatNum(outputs.greyRate, 2), "cost_per_mtr + conv_rate_per_mtr", true)}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="border border-black p-2">
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold">WRP Wt/40</div>
              <div className="mono text-[14px] font-bold">{formatNum(outputs.wrpWt40, 6)}</div>
            </div>
            <div className="border border-black p-2">
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold">WFT Wt/40</div>
              <div className="mono text-[14px] font-bold">{formatNum(outputs.wftWt40, 6)}</div>
            </div>
            <div className="border border-black p-2">
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold">Weight/40</div>
              <div className="mono text-[14px] font-bold">{formatNum(outputs.weight40, 6)}</div>
            </div>
            <div className="border border-black p-2">
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold">Qty Weight</div>
              <div className="mono text-[14px] font-bold">{formatNum(outputs.qtyWt, 2)}</div>
            </div>
            <div className="border border-black p-2">
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold">Qty Conv Amt</div>
              <div className="mono text-[14px] font-bold">{formatNum(outputs.qtyConvAmount, 2)}</div>
            </div>
            <div className="border border-black p-2">
              <div className="text-[10px] uppercase tracking-[0.1em] font-semibold">Qty Grey Amt</div>
              <div className="mono text-[14px] font-bold">{formatNum(outputs.qtyGreyAmount, 2)}</div>
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
