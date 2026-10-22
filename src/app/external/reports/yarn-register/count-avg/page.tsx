import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { readFilters, loadRegister, filterText, totalsOf, type RegisterLine } from "../voucher-register";
import { REPORT_STYLE, CompanyHeader, Signatures } from "../register-report";

export const dynamic = "force-dynamic";

const fmt = (n: number, d = 0) =>
  n ? new Intl.NumberFormat("en-PK", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n) : "";

/** Per count: what was bought and sold in the period, and at what average rate. */
export default async function CountAvgPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSession();
  const f = readFilters(await searchParams);
  const { lines, partyLabel, countLabel } = await loadRegister(f);

  const byCount = new Map<string, RegisterLine[]>();
  for (const l of lines) (byCount.get(l.countLabel) ?? (byCount.set(l.countLabel, []), byCount.get(l.countLabel)!)).push(l);

  const summarize = (ls: RegisterLine[]) => {
    const pur = totalsOf(ls.filter((l) => l.type === "PUR"));
    const sal = totalsOf(ls.filter((l) => l.type === "SAL"));
    return { pur, sal, diff: pur.avgRate && sal.avgRate ? sal.avgRate - pur.avgRate : 0 };
  };
  const rows = [...byCount.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([count, ls]) => ({ count, ...summarize(ls) }));
  const grand = summarize(lines);

  const showPur = f.type !== "SAL";
  const showSal = f.type !== "PUR";
  const cols = 1 + (showPur ? 4 : 0) + (showSal ? 4 : 0) + (showPur && showSal ? 1 : 0);

  const cells = (r: typeof grand) => (
    <>
      {showPur && (
        <>
          <td className="num">{fmt(r.pur.bags, 2)}</td>
          <td className="num">{fmt(r.pur.lbs)}</td>
          <td className="num">{fmt(r.pur.avgRate, 2)}</td>
          <td className="num">{fmt(r.pur.amount)}</td>
        </>
      )}
      {showSal && (
        <>
          <td className="num">{fmt(r.sal.bags, 2)}</td>
          <td className="num">{fmt(r.sal.lbs)}</td>
          <td className="num">{fmt(r.sal.avgRate, 2)}</td>
          <td className="num">{fmt(r.sal.amount)}</td>
        </>
      )}
      {showPur && showSal && <td className="num">{fmt(r.diff, 2)}</td>}
    </>
  );

  const excelRows = rows.map((r) => ({
    count: r.count,
    purBags: r.pur.bags,
    purLbs: r.pur.lbs,
    purAvg: Math.round(r.pur.avgRate * 100) / 100,
    purAmt: r.pur.amount,
    salBags: r.sal.bags,
    salLbs: r.sal.lbs,
    salAvg: Math.round(r.sal.avgRate * 100) / 100,
    salAmt: r.sal.amount,
    diff: Math.round(r.diff * 100) / 100,
  }));
  const excelCols = [
    { key: "count", label: "Count" },
    ...(showPur
      ? [
          { key: "purBags", label: "Pur Bags" },
          { key: "purLbs", label: "Pur Lbs" },
          { key: "purAvg", label: "Pur Avg Rate" },
          { key: "purAmt", label: "Pur Amount" },
        ]
      : []),
    ...(showSal
      ? [
          { key: "salBags", label: "Sale Bags" },
          { key: "salLbs", label: "Sale Lbs" },
          { key: "salAvg", label: "Sale Avg Rate" },
          { key: "salAmt", label: "Sale Amount" },
        ]
      : []),
    ...(showPur && showSal ? [{ key: "diff", label: "Sale − Pur Rate" }] : []),
  ];

  return (
    <>
      <style>{REPORT_STYLE}</style>
      <div className="rp-wrap">
        <div className="rp-toolbar no-print">
          <a href="/external/reports/yarn-register" className="btn btn-outline btn-sm">Back</a>
          <div className="flex gap-2 flex-wrap">
            <ExcelExportButton rows={excelRows} columns={excelCols} filename="yarn-count-avg" sheetName="CountAvg" title="COUNT AVERAGE RATE" />
            <PrintButton label="Print" />
          </div>
        </div>

        <div className="rp-page">
          <CompanyHeader />
          <div className="rp-title">COUNT AVERAGE RATE</div>
          <div className="rp-filter">{filterText(f, partyLabel, countLabel)}</div>

          <div className="rp-scroll">
            <table className="rp-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Count</th>
                  {showPur && <th colSpan={4} style={{ textAlign: "center" }}>Purchase</th>}
                  {showSal && <th colSpan={4} style={{ textAlign: "center" }}>Sale</th>}
                  {showPur && showSal && <th rowSpan={2} className="num">Sale − Pur Rate</th>}
                </tr>
                <tr>
                  {[...(showPur ? ["P"] : []), ...(showSal ? ["S"] : [])].map((k) => (
                    <SubHeads key={k} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={cols} className="rp-empty">No yarn vouchers for the selected filters.</td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.count}>
                    <td>{r.count}</td>
                    {cells(r)}
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td>Grand Total</td>
                    {cells(grand)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <Signatures />
        </div>
      </div>
    </>
  );
}

function SubHeads() {
  return (
    <>
      <th className="num">Bags</th>
      <th className="num">Lbs</th>
      <th className="num">Avg Rate</th>
      <th className="num">Amount</th>
    </>
  );
}
