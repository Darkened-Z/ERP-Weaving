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
  locationOptions,
} from "../../_shared";

export const dynamic = "force-dynamic";

export default async function YarnStockPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string; location?: string; neg?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const count = p.count?.trim() ?? "";
  const location = p.location?.trim() ?? "";
  const onlyNeg = p.neg === "1";

  const [partyOpts, countOpts, locationOpts, countMetaRows] = await Promise.all([
    partyByNameOptions(),
    yarnCountOptions(),
    locationOptions(),
    db.select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description }).from(schema.yarnCounts),
  ]);
  const countDescMap = new Map(countMetaRows.map((r) => [r.code, r.description]));

  const receiptConds = [
    gte(schema.intYarnReceipt.vDate, from),
    lte(schema.intYarnReceipt.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    receiptConds.push(sql`${schema.intYarnReceipt.party} LIKE ${pat} ESCAPE '\\'`);
  }
  if (count) {
    receiptConds.push(sql`${schema.intYarnReceipt.countCode} = ${count}`);
  }
  if (location) {
    const pat = `%${escLike(location)}%`;
    receiptConds.push(sql`${schema.intYarnReceipt.locationFrom} LIKE ${pat} ESCAPE '\\'`);
  }

  const transferConds = [
    gte(schema.intYarnTransfer.vDate, from),
    lte(schema.intYarnTransfer.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    transferConds.push(sql`(${schema.intYarnTransfer.transferFromParty} LIKE ${pat} ESCAPE '\\' OR ${schema.intYarnTransfer.transferToParty} LIKE ${pat} ESCAPE '\\')`);
  }
  if (count) {
    transferConds.push(sql`${schema.intYarnTransfer.countCode} = ${count}`);
  }
  if (location) {
    const pat = `%${escLike(location)}%`;
    transferConds.push(sql`(${schema.intYarnTransfer.locationFrom} LIKE ${pat} ESCAPE '\\' OR ${schema.intYarnTransfer.locationTo} LIKE ${pat} ESCAPE '\\')`);
  }

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

  const map = new Map<string, { count: string; rcvBags: number; rcvLbs: number; rcvAmt: number; issBags: number; issLbs: number }>();
  for (const r of receiptAgg) {
    const k = r.countCode ?? "—";
    const b = map.get(k) ?? { count: k, rcvBags: 0, rcvLbs: 0, rcvAmt: 0, issBags: 0, issLbs: 0 };
    b.rcvBags += r.bags;
    b.rcvLbs += r.lbs;
    b.rcvAmt += r.amt;
    map.set(k, b);
  }
  for (const r of transferAgg) {
    const k = r.countCode ?? "—";
    const b = map.get(k) ?? { count: k, rcvBags: 0, rcvLbs: 0, rcvAmt: 0, issBags: 0, issLbs: 0 };
    b.issBags += r.bags;
    b.issLbs += r.lbs;
    map.set(k, b);
  }

  const rows = Array.from(map.values())
    .map((r) => ({
      ...r,
      balBags: r.rcvBags - r.issBags,
      balLbs: r.rcvLbs - r.issLbs,
      avgRate: r.rcvLbs > 0 ? r.rcvAmt / r.rcvLbs : 0,
    }))
    .filter((r) => r.rcvLbs || r.issLbs)
    .filter((r) => (onlyNeg ? r.balLbs < 0 || r.balBags < 0 : true))
    .sort((a, b) => a.count.localeCompare(b.count));

  const tot = rows.reduce(
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
    <Shell active="rpt-yarn-stock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Stock (Count-wise)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} counts · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                count: r.count,
                rcvBags: r.rcvBags,
                rcvLbs: Math.round(r.rcvLbs),
                issBags: r.issBags,
                issLbs: Math.round(r.issLbs),
                balBags: r.balBags,
                balLbs: Math.round(r.balLbs),
                avgRate: Number(r.avgRate.toFixed(2)),
              }))}
              columns={[
                { key: "count", label: "Count" },
                { key: "rcvBags", label: "Rcv Bags" },
                { key: "rcvLbs", label: "Rcv Lbs" },
                { key: "issBags", label: "Iss Bags" },
                { key: "issLbs", label: "Iss Lbs" },
                { key: "balBags", label: "Bal Bags" },
                { key: "balLbs", label: "Bal Lbs" },
                { key: "avgRate", label: "Avg Rate/Lb" },
              ]}
              filename="yarn-stock"
              sheetName="Stock"
            />
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-5 gap-4 no-print"
        >
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
          <div>
            <label className="label block mb-1">Location</label>
            <Combobox name="location" options={locationOpts} defaultValue={location} placeholder="All locations" />
          </div>
          <div className="sm:col-span-5 flex gap-2 flex-wrap items-center">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/yarn/stock" className="btn btn-outline btn-sm">Clear</a>
            <label className="flex items-center gap-2 text-[12px] mono ml-2">
              <input
                type="checkbox"
                name="neg"
                value="1"
                defaultChecked={onlyNeg}
              />
              Only Negative Stock
            </label>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Count</th>
                <th className="text-right">Rcv Bags</th>
                <th className="text-right">Rcv Lbs</th>
                <th className="text-right">Iss Bags</th>
                <th className="text-right">Iss Lbs</th>
                <th className="text-right">Bal Bags</th>
                <th className="text-right">Bal Lbs</th>
                <th className="text-right">Avg Rate/Lb</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-8">
                    No yarn stock activity for filters
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.count}>
                    <td className="mono font-bold">
                      {r.count}
                      {countDescMap.get(r.count) ? (
                        <div className="text-[11px] text-[var(--muted)]">{countDescMap.get(r.count)}</div>
                      ) : null}
                    </td>
                    <td className="mono text-right">{fmt(r.rcvBags)}</td>
                    <td className="mono text-right">{fmt(r.rcvLbs)}</td>
                    <td className="mono text-right">{fmt(r.issBags)}</td>
                    <td className="mono text-right">{fmt(r.issLbs)}</td>
                    <td className="mono text-right font-bold">{fmt(r.balBags)}</td>
                    <td className="mono text-right font-bold">{fmt(r.balLbs)}</td>
                    <td className="mono text-right">{fmt2(r.avgRate)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td>Total</td>
                  <td className="mono text-right">{fmt(tot.rcvBags)}</td>
                  <td className="mono text-right">{fmt(tot.rcvLbs)}</td>
                  <td className="mono text-right">{fmt(tot.issBags)}</td>
                  <td className="mono text-right">{fmt(tot.issLbs)}</td>
                  <td className="mono text-right">{fmt(tot.balBags)}</td>
                  <td className="mono text-right">{fmt(tot.balLbs)}</td>
                  <td className="mono text-right">{fmt2(tot.rcvLbs > 0 ? tot.rcvAmt / tot.rcvLbs : 0)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
