import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, lte, sql, eq } from "drizzle-orm";
import { DateBox } from "@/components/date-box";
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

export default async function YarnStockPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string; neg?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const count = p.count?.trim() ?? "";
  const onlyNeg = p.neg === "1";

  const [partyOpts, countOpts, countMetaRows] = await Promise.all([
    partyByNameOptions(),
    yarnCountOptions(),
    db.select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description }).from(schema.yarnCounts),
  ]);
  const countDescMap = new Map(countMetaRows.map((r) => [r.code, r.description]));

  const purConds = [lte(schema.extYarnPurVoucher.vDate, to)];
  if (party) {
    const pat = `%${escLike(party)}%`;
    purConds.push(sql`${schema.extYarnPurVoucher.party} LIKE ${pat} ESCAPE '\\'`);
  }
  if (count) purConds.push(eq(schema.extYarnPurVoucherLine.count, count));

  const purchases = await db
    .select({
      vDate: schema.extYarnPurVoucher.vDate,
      count: schema.extYarnPurVoucherLine.count,
      bags: schema.extYarnPurVoucherLine.bag,
      lbs: schema.extYarnPurVoucherLine.lbs,
      rate: schema.extYarnPurVoucherLine.rate,
    })
    .from(schema.extYarnPurVoucherLine)
    .innerJoin(schema.extYarnPurVoucher, eq(schema.extYarnPurVoucher.id, schema.extYarnPurVoucherLine.voucherId))
    .where(and(...purConds));

  const salConds = [lte(schema.extYarnSalVoucher.vDate, to)];
  if (party) {
    const pat = `%${escLike(party)}%`;
    salConds.push(sql`${schema.extYarnSalVoucher.party} LIKE ${pat} ESCAPE '\\'`);
  }
  if (count) salConds.push(eq(schema.extYarnSalVoucherLine.count, count));

  const sales = await db
    .select({
      vDate: schema.extYarnSalVoucher.vDate,
      count: schema.extYarnSalVoucherLine.count,
      bags: schema.extYarnSalVoucherLine.bag,
      lbs: schema.extYarnSalVoucherLine.lbs,
    })
    .from(schema.extYarnSalVoucherLine)
    .innerJoin(schema.extYarnSalVoucher, eq(schema.extYarnSalVoucher.id, schema.extYarnSalVoucherLine.voucherId))
    .where(and(...salConds));

  type Acc = { count: string; opBags: number; opLbs: number; rcvBags: number; rcvLbs: number; rcvAmt: number; issBags: number; issLbs: number };
  const map = new Map<string, Acc>();
  const at = (k: string) => {
    const b = map.get(k) ?? { count: k, opBags: 0, opLbs: 0, rcvBags: 0, rcvLbs: 0, rcvAmt: 0, issBags: 0, issLbs: 0 };
    map.set(k, b);
    return b;
  };

  for (const r of purchases) {
    const cnt = (r.count ?? "").trim() || "—";
    const bags = Number(r.bags ?? 0);
    const lbs = Number(r.lbs ?? 0);
    const rate = Number(r.rate ?? 0);
    const b = at(cnt);
    if (r.vDate < from) {
      b.opBags += bags;
      b.opLbs += lbs;
    } else {
      b.rcvBags += bags;
      b.rcvLbs += lbs;
      b.rcvAmt += rate * lbs;
    }
  }

  for (const r of sales) {
    const cnt = (r.count ?? "").trim() || "—";
    const bags = Number(r.bags ?? 0);
    const lbs = Number(r.lbs ?? 0);
    const b = at(cnt);
    if (r.vDate < from) {
      b.opBags -= bags;
      b.opLbs -= lbs;
    } else {
      b.issBags += bags;
      b.issLbs += lbs;
    }
  }

  const rows = Array.from(map.values())
    .map((r) => ({
      ...r,
      balBags: r.opBags + r.rcvBags - r.issBags,
      balLbs: r.opLbs + r.rcvLbs - r.issLbs,
      avgRate: r.rcvLbs > 0 ? r.rcvAmt / r.rcvLbs : 0,
    }))
    .filter((r) => r.opLbs || r.rcvLbs || r.issLbs)
    .filter((r) => (onlyNeg ? r.balLbs < 0 || r.balBags < 0 : true))
    .sort((a, b) => a.count.localeCompare(b.count));

  const tot = rows.reduce(
    (t, r) => ({
      opBags: t.opBags + r.opBags,
      opLbs: t.opLbs + r.opLbs,
      rcvBags: t.rcvBags + r.rcvBags,
      rcvLbs: t.rcvLbs + r.rcvLbs,
      rcvAmt: t.rcvAmt + r.rcvAmt,
      issBags: t.issBags + r.issBags,
      issLbs: t.issLbs + r.issLbs,
      balBags: t.balBags + r.balBags,
      balLbs: t.balLbs + r.balLbs,
    }),
    { opBags: 0, opLbs: 0, rcvBags: 0, rcvLbs: 0, rcvAmt: 0, issBags: 0, issLbs: 0, balBags: 0, balLbs: 0 }
  );

  return (
    <Shell active="rpt-yarn-stock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Stock (Count-wise)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} counts &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                count: r.count,
                opBags: r.opBags,
                opLbs: Math.round(r.opLbs),
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
                { key: "opBags", label: "Op Bags" },
                { key: "opLbs", label: "Op Lbs" },
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
            <a href="/external/reports/yarn-stock" className="btn btn-outline btn-sm no-print">Voucher-wise</a>
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Date From</label>
            <DateBox name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <DateBox name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div>
            <label className="label block mb-1">Count</label>
            <Combobox name="count" options={countOpts} defaultValue={count} placeholder="All counts" />
          </div>
          <div className="sm:col-span-4 flex gap-2 flex-wrap items-center">
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
                <th className="text-right">Op Bags</th>
                <th className="text-right">Op Lbs</th>
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
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
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
                    <td className="mono text-right">{fmt(r.opBags)}</td>
                    <td className="mono text-right">{fmt(r.opLbs)}</td>
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
                  <td className="mono text-right">{fmt(tot.opBags)}</td>
                  <td className="mono text-right">{fmt(tot.opLbs)}</td>
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
