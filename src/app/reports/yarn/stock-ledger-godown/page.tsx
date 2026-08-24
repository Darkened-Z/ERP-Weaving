import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import {
  fmt,
  escLike,
  sixMonthsAgo,
  todayIso,
  partyByNameOptions,
  yarnCountOptions,
} from "../../_shared";

export const dynamic = "force-dynamic";

type Row = {
  location: string;
  count: string;
  rcvBags: number;
  rcvLbs: number;
  inBags: number;
  inLbs: number;
  outBags: number;
  outLbs: number;
};

export default async function YarnStockLedgerGodownPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const count = p.count?.trim() ?? "";

  const [partyOpts, countOpts] = await Promise.all([partyByNameOptions(), yarnCountOptions()]);

  const receiptConds = [
    gte(schema.intYarnReceipt.vDate, from),
    lte(schema.intYarnReceipt.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    receiptConds.push(sql`${schema.intYarnReceipt.party} LIKE ${pat} ESCAPE '\\'`);
  }
  if (count) receiptConds.push(sql`${schema.intYarnReceipt.countCode} = ${count}`);

  const transferConds = [
    gte(schema.intYarnTransfer.vDate, from),
    lte(schema.intYarnTransfer.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    transferConds.push(sql`(${schema.intYarnTransfer.transferFromParty} LIKE ${pat} ESCAPE '\\' OR ${schema.intYarnTransfer.transferToParty} LIKE ${pat} ESCAPE '\\')`);
  }
  if (count) transferConds.push(sql`${schema.intYarnTransfer.countCode} = ${count}`);

  const receipts = await db
    .select({
      location: schema.intYarnReceipt.locationFrom,
      countCode: schema.intYarnReceipt.countCode,
      bags: sql<number>`coalesce(sum(${schema.intYarnReceipt.bags}), 0)`,
      lbs: sql<number>`coalesce(sum(${schema.intYarnReceipt.qtyLbs}), 0)`,
    })
    .from(schema.intYarnReceipt)
    .where(and(...receiptConds))
    .groupBy(schema.intYarnReceipt.locationFrom, schema.intYarnReceipt.countCode);

  const transfersOut = await db
    .select({
      location: schema.intYarnTransfer.locationFrom,
      countCode: schema.intYarnTransfer.countCode,
      bags: sql<number>`coalesce(sum(${schema.intYarnTransfer.qtyBags}), 0)`,
      lbs: sql<number>`coalesce(sum(${schema.intYarnTransfer.qtyLbs}), 0)`,
    })
    .from(schema.intYarnTransfer)
    .where(and(...transferConds))
    .groupBy(schema.intYarnTransfer.locationFrom, schema.intYarnTransfer.countCode);

  const transfersIn = await db
    .select({
      location: schema.intYarnTransfer.locationTo,
      countCode: schema.intYarnTransfer.countCode,
      bags: sql<number>`coalesce(sum(${schema.intYarnTransfer.qtyBags}), 0)`,
      lbs: sql<number>`coalesce(sum(${schema.intYarnTransfer.qtyLbs}), 0)`,
    })
    .from(schema.intYarnTransfer)
    .where(and(...transferConds))
    .groupBy(schema.intYarnTransfer.locationTo, schema.intYarnTransfer.countCode);

  const map = new Map<string, Row>();
  const bucket = (loc: string | null, cnt: string | null): Row => {
    const key = `${loc ?? "—"}||${cnt ?? "—"}`;
    let b = map.get(key);
    if (!b) {
      b = { location: loc ?? "—", count: cnt ?? "—", rcvBags: 0, rcvLbs: 0, inBags: 0, inLbs: 0, outBags: 0, outLbs: 0 };
      map.set(key, b);
    }
    return b;
  };
  for (const r of receipts) {
    const b = bucket(r.location, r.countCode);
    b.rcvBags += r.bags;
    b.rcvLbs += r.lbs;
  }
  for (const r of transfersOut) {
    const b = bucket(r.location, r.countCode);
    b.outBags += r.bags;
    b.outLbs += r.lbs;
  }
  for (const r of transfersIn) {
    const b = bucket(r.location, r.countCode);
    b.inBags += r.bags;
    b.inLbs += r.lbs;
  }

  const rows = Array.from(map.values())
    .map((r) => ({ ...r, balBags: r.rcvBags + r.inBags - r.outBags, balLbs: r.rcvLbs + r.inLbs - r.outLbs }))
    .filter((r) => r.rcvBags || r.inBags || r.outBags)
    .sort((a, b) => a.location.localeCompare(b.location) || a.count.localeCompare(b.count));

  const totals = rows.reduce(
    (t, r) => ({
      rcvBags: t.rcvBags + r.rcvBags,
      rcvLbs: t.rcvLbs + r.rcvLbs,
      inBags: t.inBags + r.inBags,
      inLbs: t.inLbs + r.inLbs,
      outBags: t.outBags + r.outBags,
      outLbs: t.outLbs + r.outLbs,
      balBags: t.balBags + r.balBags,
      balLbs: t.balLbs + r.balLbs,
    }),
    { rcvBags: 0, rcvLbs: 0, inBags: 0, inLbs: 0, outBags: 0, outLbs: 0, balBags: 0, balLbs: 0 }
  );

  return (
    <Shell active="rpt-yarn-stock-godown">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Stock Ledger by Godown</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} location × count buckets · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                location: r.location,
                count: r.count,
                rcvBags: r.rcvBags,
                rcvLbs: Math.round(r.rcvLbs),
                inBags: r.inBags,
                inLbs: Math.round(r.inLbs),
                outBags: r.outBags,
                outLbs: Math.round(r.outLbs),
                balBags: r.balBags,
                balLbs: Math.round(r.balLbs),
              }))}
              columns={[
                { key: "location", label: "Location" },
                { key: "count", label: "Count" },
                { key: "rcvBags", label: "Rcv Bags" },
                { key: "rcvLbs", label: "Rcv Lbs" },
                { key: "inBags", label: "Tr-In Bags" },
                { key: "inLbs", label: "Tr-In Lbs" },
                { key: "outBags", label: "Tr-Out Bags" },
                { key: "outLbs", label: "Tr-Out Lbs" },
                { key: "balBags", label: "Bal Bags" },
                { key: "balLbs", label: "Bal Lbs" },
              ]}
              filename="yarn-stock-ledger-godown"
              sheetName="StockLedger"
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
            <a href="/reports/yarn/stock-ledger-godown" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>Count</th>
                <th className="text-right">Rcv Bags</th>
                <th className="text-right">Rcv Lbs</th>
                <th className="text-right">Tr-In Bags</th>
                <th className="text-right">Tr-In Lbs</th>
                <th className="text-right">Tr-Out Bags</th>
                <th className="text-right">Tr-Out Lbs</th>
                <th className="text-right">Bal Bags</th>
                <th className="text-right">Bal Lbs</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
                    No yarn movement in period
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-[13px]">{r.location}</td>
                    <td className="mono">{r.count}</td>
                    <td className="mono text-right">{fmt(r.rcvBags)}</td>
                    <td className="mono text-right">{fmt(r.rcvLbs)}</td>
                    <td className="mono text-right">{fmt(r.inBags)}</td>
                    <td className="mono text-right">{fmt(r.inLbs)}</td>
                    <td className="mono text-right">{fmt(r.outBags)}</td>
                    <td className="mono text-right">{fmt(r.outLbs)}</td>
                    <td className="mono text-right font-bold">{fmt(r.balBags)}</td>
                    <td className="mono text-right font-bold">{fmt(r.balLbs)}</td>
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
                  <td className="mono text-right">{fmt(totals.inBags)}</td>
                  <td className="mono text-right">{fmt(totals.inLbs)}</td>
                  <td className="mono text-right">{fmt(totals.outBags)}</td>
                  <td className="mono text-right">{fmt(totals.outLbs)}</td>
                  <td className="mono text-right">{fmt(totals.balBags)}</td>
                  <td className="mono text-right">{fmt(totals.balLbs)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
