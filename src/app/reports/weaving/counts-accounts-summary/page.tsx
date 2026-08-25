import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq } from "drizzle-orm";
import { today as todayFn } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function monthsBackFrom(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default async function CountsAccountsSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; count?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || monthsBackFrom(today, 6);
  const to = params.to?.trim() || today;
  const countQ = params.count?.trim() || "";

  const yarnCountRows = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts);
  const yarnCountMap = new Map(yarnCountRows.map((r) => [r.countCode, r.description]));

  const receiptConds = [
    gte(schema.intYarnReceipt.vDate, from),
    lte(schema.intYarnReceipt.vDate, to),
  ];
  const receipts = await db
    .select({
      countCode: schema.intYarnReceipt.countCode,
      lbs: sql<number>`coalesce(sum(${schema.intYarnReceipt.qtyLbs}), 0)`,
      bags: sql<number>`coalesce(sum(${schema.intYarnReceipt.bags}), 0)`,
    })
    .from(schema.intYarnReceipt)
    .where(and(...receiptConds))
    .groupBy(schema.intYarnReceipt.countCode);

  const consumedRows = await db
    .select({
      yarnCount: schema.beams.yarnCount,
      lbs: sql<number>`coalesce(sum(${schema.beams.weight}), 0)`,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id)
    )
    .innerJoin(schema.beams, eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo))
    .where(and(gte(schema.intDailyProduction.vDate, from), lte(schema.intDailyProduction.vDate, to)))
    .groupBy(schema.beams.yarnCount);

  const consumedMap = new Map<string, number>();
  for (const r of consumedRows) if (r.yarnCount) consumedMap.set(r.yarnCount, r.lbs ?? 0);

  const allCounts = new Set<string>();
  for (const r of receipts) if (r.countCode) allCounts.add(r.countCode);
  for (const c of consumedMap.keys()) allCounts.add(c);

  const rows = Array.from(allCounts)
    .filter((c) => !countQ || c.toLowerCase().includes(countQ.toLowerCase()))
    .sort()
    .map((code) => {
      const rec = receipts.find((r) => r.countCode === code);
      const inp = rec?.lbs ?? 0;
      const bags = rec?.bags ?? 0;
      const cons = consumedMap.get(code) ?? 0;
      return { count: code, bags, input: inp, consumed: cons, wastage: inp - cons };
    });

  const totIn = rows.reduce((s, r) => s + r.input, 0);
  const totCn = rows.reduce((s, r) => s + r.consumed, 0);
  const totBg = rows.reduce((s, r) => s + r.bags, 0);

  const excelRows = rows.map((r) => ({
    count: r.count,
    bags: Math.round(r.bags),
    input: Math.round(r.input),
    consumed: Math.round(r.consumed),
    wastage: Math.round(r.wastage),
  }));

  return (
    <Shell active="w-counts-sum">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Weaving Counts Accounts — Summary</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} counts &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "count", label: "Count" },
                { key: "bags", label: "Bags" },
                { key: "input", label: "Input Lbs" },
                { key: "consumed", label: "Consumed Lbs" },
                { key: "wastage", label: "Wastage Lbs" },
              ]}
              filename="weaving-counts-summary"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Weaving Counts Accounts — Summary</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
            {countQ ? ` · Count: ${countQ}` : ""}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Count</label>
            <input
              type="text"
              name="count"
              defaultValue={countQ}
              className="input-box mono"
              placeholder="Filter count"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/counts-accounts-summary" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{rows.length}</div>
            <div className="stat-label">Counts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totBg)}</div>
            <div className="stat-label">Bags</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totIn)}</div>
            <div className="stat-label">Input Lbs</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totCn)}</div>
            <div className="stat-label">Consumed Lbs</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Count</th>
                <th className="text-right">Bags</th>
                <th className="text-right">Input Lbs</th>
                <th className="text-right">Consumed Lbs</th>
                <th className="text-right">Wastage Lbs</th>
                <th className="text-right">Wastage %</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-[var(--muted)] py-8">
                    No data
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.count}>
                    <td className="mono">
                      {r.count}
                      {yarnCountMap.get(r.count) && (
                        <div className="text-[11px] text-[var(--muted)]">
                          {yarnCountMap.get(r.count)}
                        </div>
                      )}
                    </td>
                    <td className="mono text-right">{fmt(r.bags)}</td>
                    <td className="mono text-right">{fmt(r.input)}</td>
                    <td className="mono text-right">{fmt(r.consumed)}</td>
                    <td className="mono text-right">{fmt(r.wastage)}</td>
                    <td className="mono text-right">
                      {r.input > 0 ? fmt2((r.wastage / r.input) * 100) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td>GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(totBg)}</td>
                  <td className="mono text-right">{fmt(totIn)}</td>
                  <td className="mono text-right">{fmt(totCn)}</td>
                  <td className="mono text-right">{fmt(totIn - totCn)}</td>
                  <td className="mono text-right">
                    {totIn > 0 ? fmt2(((totIn - totCn) / totIn) * 100) : "-"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
