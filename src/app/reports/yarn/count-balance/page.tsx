import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import {
  fmt,
  fmt2,
  sixMonthsAgo,
  todayIso,
  yarnCountOptions,
} from "../../_shared";

export const dynamic = "force-dynamic";

export default async function YarnCountBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; count?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const count = p.count?.trim() ?? "";

  const [countOpts, allCounts] = await Promise.all([
    yarnCountOptions(),
    db.select().from(schema.yarnCounts),
  ]);

  const receiptConds = [
    gte(schema.intYarnReceipt.vDate, from),
    lte(schema.intYarnReceipt.vDate, to),
  ];
  if (count) receiptConds.push(sql`${schema.intYarnReceipt.countCode} = ${count}`);

  const transferConds = [
    gte(schema.intYarnTransfer.vDate, from),
    lte(schema.intYarnTransfer.vDate, to),
  ];
  if (count) transferConds.push(sql`${schema.intYarnTransfer.countCode} = ${count}`);

  const receiptAgg = await db
    .select({
      countCode: schema.intYarnReceipt.countCode,
      bags: sql<number>`coalesce(sum(${schema.intYarnReceipt.bags}), 0)`,
      lbs: sql<number>`coalesce(sum(${schema.intYarnReceipt.qtyLbs}), 0)`,
      amt: sql<number>`coalesce(sum(${schema.intYarnReceipt.amount}), 0)`,
    })
    .from(schema.intYarnReceipt)
    .where(and(...receiptConds))
    .groupBy(schema.intYarnReceipt.countCode);

  const transferAgg = await db
    .select({
      countCode: schema.intYarnTransfer.countCode,
      bags: sql<number>`coalesce(sum(${schema.intYarnTransfer.qtyBags}), 0)`,
      lbs: sql<number>`coalesce(sum(${schema.intYarnTransfer.qtyLbs}), 0)`,
    })
    .from(schema.intYarnTransfer)
    .where(and(...transferConds))
    .groupBy(schema.intYarnTransfer.countCode);

  const rcvMap = new Map(receiptAgg.map((r) => [r.countCode ?? "—", r]));
  const trfMap = new Map(transferAgg.map((r) => [r.countCode ?? "—", r]));

  const codes = new Set<string>([...rcvMap.keys(), ...trfMap.keys()]);
  if (count) codes.add(count);

  const rows = Array.from(codes).map((c) => {
    const r = rcvMap.get(c);
    const t = trfMap.get(c);
    const meta = allCounts.find((y) => y.countCode === c);
    const rcvBags = r?.bags ?? 0;
    const rcvLbs = r?.lbs ?? 0;
    const rcvAmt = r?.amt ?? 0;
    const issBags = t?.bags ?? 0;
    const issLbs = t?.lbs ?? 0;
    return {
      count: c,
      description: meta?.description ?? "",
      rcvBags,
      rcvLbs,
      rcvAmt,
      issBags,
      issLbs,
      balBags: rcvBags - issBags,
      balLbs: rcvLbs - issLbs,
      avgCost: rcvLbs > 0 ? rcvAmt / rcvLbs : 0,
    };
  })
    .filter((r) => r.rcvLbs || r.issLbs)
    .sort((a, b) => a.count.localeCompare(b.count));

  const totals = rows.reduce(
    (t, r) => ({
      rcvBags: t.rcvBags + r.rcvBags,
      rcvLbs: t.rcvLbs + r.rcvLbs,
      rcvAmt: t.rcvAmt + r.rcvAmt,
      issBags: t.issBags + r.issBags,
      issLbs: t.issLbs + r.issLbs,
      balBags: t.balBags + r.balBags,
      balLbs: t.balLbs + r.balLbs,
    }),
    { rcvBags: 0, rcvLbs: 0, rcvAmt: 0, issBags: 0, issLbs: 0, balBags: 0, balLbs: 0 }
  );

  return (
    <Shell active="rpt-yarn-count-balance">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Count Balance Summary</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} counts · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                count: r.count,
                description: r.description,
                rcvBags: r.rcvBags,
                rcvLbs: Math.round(r.rcvLbs),
                issBags: r.issBags,
                issLbs: Math.round(r.issLbs),
                balBags: r.balBags,
                balLbs: Math.round(r.balLbs),
                avgCost: Number(r.avgCost.toFixed(2)),
              }))}
              columns={[
                { key: "count", label: "Count" },
                { key: "description", label: "Description" },
                { key: "rcvBags", label: "Rcv Bags" },
                { key: "rcvLbs", label: "Rcv Lbs" },
                { key: "issBags", label: "Iss Bags" },
                { key: "issLbs", label: "Iss Lbs" },
                { key: "balBags", label: "Bal Bags" },
                { key: "balLbs", label: "Bal Lbs" },
                { key: "avgCost", label: "Avg Cost/Lb" },
              ]}
              filename="yarn-count-balance"
              sheetName="Balance"
            />
          </div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Count</label>
            <Combobox name="count" options={countOpts} defaultValue={count} placeholder="All counts" />
          </div>
          <div className="sm:col-span-3 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/yarn/count-balance" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Count</th>
                <th>Description</th>
                <th className="text-right">Rcv Bags</th>
                <th className="text-right">Rcv Lbs</th>
                <th className="text-right">Iss Bags</th>
                <th className="text-right">Iss Lbs</th>
                <th className="text-right">Bal Bags</th>
                <th className="text-right">Bal Lbs</th>
                <th className="text-right">Avg Cost/Lb</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--muted)] py-8">
                    No count activity in period
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.count}>
                    <td className="mono font-bold">{r.count}</td>
                    <td className="text-[13px]">{r.description}</td>
                    <td className="mono text-right">{fmt(r.rcvBags)}</td>
                    <td className="mono text-right">{fmt(r.rcvLbs)}</td>
                    <td className="mono text-right">{fmt(r.issBags)}</td>
                    <td className="mono text-right">{fmt(r.issLbs)}</td>
                    <td className="mono text-right font-bold">{fmt(r.balBags)}</td>
                    <td className="mono text-right font-bold">{fmt(r.balLbs)}</td>
                    <td className="mono text-right">{fmt2(r.avgCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>Total</td>
                  <td className="mono text-right">{fmt(totals.rcvBags)}</td>
                  <td className="mono text-right">{fmt(totals.rcvLbs)}</td>
                  <td className="mono text-right">{fmt(totals.issBags)}</td>
                  <td className="mono text-right">{fmt(totals.issLbs)}</td>
                  <td className="mono text-right">{fmt(totals.balBags)}</td>
                  <td className="mono text-right">{fmt(totals.balLbs)}</td>
                  <td className="mono text-right">{fmt2(totals.rcvLbs > 0 ? totals.rcvAmt / totals.rcvLbs : 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
