import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import {
  fmt,
  fmt2,
  escLike,
  sixMonthsAgo,
  todayIso,
  partyByNameOptions,
  yarnCountOptions,
} from "../../_shared";

export const dynamic = "force-dynamic";

export default async function YarnCountAvgRatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const count = p.count?.trim() ?? "";

  const [partyOpts, countOpts, countMetaRows] = await Promise.all([
    partyByNameOptions(),
    yarnCountOptions(),
    db.select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description }).from(schema.yarnCounts),
  ]);
  const countDescMap = new Map(countMetaRows.map((r) => [r.code, r.description]));

  const conds = [
    gte(schema.extYarnPurVoucher.vDate, from),
    lte(schema.extYarnPurVoucher.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conds.push(sql`${schema.extYarnPurVoucher.party} LIKE ${pat} ESCAPE '\\'`);
  }
  if (count) conds.push(sql`${schema.extYarnPurVoucherLine.count} = ${count}`);

  const rows = await db
    .select({
      count: schema.extYarnPurVoucherLine.count,
      lines: sql<number>`count(*)`,
      totalBags: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag}), 0)`,
      totalLbs: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs}), 0)`,
      weightedRateNum: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag} * ${schema.extYarnPurVoucherLine.rate}), 0)`,
      totalAmt: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs} * ${schema.extYarnPurVoucherLine.rate}), 0)`,
    })
    .from(schema.extYarnPurVoucherLine)
    .innerJoin(
      schema.extYarnPurVoucher,
      sql`${schema.extYarnPurVoucherLine.voucherId} = ${schema.extYarnPurVoucher.id}`
    )
    .where(and(...conds))
    .groupBy(schema.extYarnPurVoucherLine.count);

  const enriched = rows
    .map((r) => ({
      ...r,
      avgRatePerBag: r.totalBags > 0 ? r.weightedRateNum / r.totalBags : 0,
      avgRatePerLbs: r.totalLbs > 0 ? r.totalAmt / r.totalLbs : 0,
    }))
    .sort((a, b) => (a.count ?? "").localeCompare(b.count ?? ""));

  const grandBags = enriched.reduce((s, r) => s + r.totalBags, 0);
  const grandLbs = enriched.reduce((s, r) => s + r.totalLbs, 0);
  const grandAmt = enriched.reduce((s, r) => s + r.totalAmt, 0);
  const grandWtNum = enriched.reduce((s, r) => s + r.weightedRateNum, 0);
  const grandAvgBag = grandBags > 0 ? grandWtNum / grandBags : 0;
  const grandAvgLbs = grandLbs > 0 ? grandAmt / grandLbs : 0;

  return (
    <Shell active="rpt-yarn-count-avg-rate">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Count Average Rate</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {enriched.length} counts · {from} to {to} · from purchase vouchers
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={enriched.map((r) => ({
                count: r.count ?? "",
                lines: r.lines,
                totalBags: r.totalBags,
                totalLbs: Math.round(r.totalLbs),
                totalAmt: Math.round(r.totalAmt),
                avgRatePerBag: Number(r.avgRatePerBag.toFixed(2)),
                avgRatePerLbs: Number(r.avgRatePerLbs.toFixed(2)),
              }))}
              columns={[
                { key: "count", label: "Count" },
                { key: "lines", label: "Lines" },
                { key: "totalBags", label: "Total Bags" },
                { key: "totalLbs", label: "Total Lbs" },
                { key: "totalAmt", label: "Total Amount" },
                { key: "avgRatePerBag", label: "Wt.Avg Rate/Bag" },
                { key: "avgRatePerLbs", label: "Wt.Avg Rate/Lb" },
              ]}
              filename="yarn-count-avg-rate"
              sheetName="AvgRate"
            />
          </div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div>
            <label className="label block mb-1">Count</label>
            <Combobox name="count" options={countOpts} defaultValue={count} placeholder="All counts" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/yarn/count-avg-rate" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Count</th>
                <th className="text-right">Lines</th>
                <th className="text-right">Total Bags</th>
                <th className="text-right">Total Lbs</th>
                <th className="text-right">Total Amount</th>
                <th className="text-right">Wt.Avg Rate/Bag</th>
                <th className="text-right">Wt.Avg Rate/Lb</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-[var(--muted)] py-8">
                    No purchase voucher lines in period
                  </td>
                </tr>
              ) : (
                enriched.map((r) => (
                  <tr key={r.count ?? "—"}>
                    <td className="mono font-bold">
                      {r.count ?? "—"}
                      {r.count && countDescMap.get(r.count) ? (
                        <div className="text-[11px] text-[var(--muted)]">{countDescMap.get(r.count)}</div>
                      ) : null}
                    </td>
                    <td className="mono text-right">{fmt(r.lines)}</td>
                    <td className="mono text-right">{fmt(r.totalBags)}</td>
                    <td className="mono text-right">{fmt(r.totalLbs)}</td>
                    <td className="mono text-right">{fmt(r.totalAmt)}</td>
                    <td className="mono text-right">{fmt2(r.avgRatePerBag)}</td>
                    <td className="mono text-right font-bold">{fmt2(r.avgRatePerLbs)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {enriched.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td>Grand Total</td>
                  <td></td>
                  <td className="mono text-right">{fmt(grandBags)}</td>
                  <td className="mono text-right">{fmt(grandLbs)}</td>
                  <td className="mono text-right">{fmt(grandAmt)}</td>
                  <td className="mono text-right">{fmt2(grandAvgBag)}</td>
                  <td className="mono text-right">{fmt2(grandAvgLbs)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
