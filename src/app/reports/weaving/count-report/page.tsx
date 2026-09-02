import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq } from "drizzle-orm";
import { fmt, fmt2, escLike, sixMonthsAgo, todayIso, partyByNameOptions, yarnCountOptions } from "../../_shared";

export const dynamic = "force-dynamic";

// WEAVING COUNTS ACCOUNTS — party × count. Seed = yarn sold to the party
// (ext_yarn_sal_voucher, the "Yarn Sale Register"); Consumed = the yarn the
// packi-parchi conversions used for that party+count (ext_packi_parchi_count);
// Balance = Seed − Consumed. Each count links to its detail ledger.
export default async function WeavingCountReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const count = p.count?.trim() ?? "";

  const [partyOpts, countOpts, allCounts] = await Promise.all([
    partyByNameOptions(),
    yarnCountOptions(),
    db.select().from(schema.yarnCounts),
  ]);
  const descByCode = new Map(allCounts.map((c) => [c.countCode, c.description ?? ""]));

  // Seed — yarn sold to the party, by party + count.
  const seedConds = [gte(schema.extYarnSalVoucher.vDate, from), lte(schema.extYarnSalVoucher.vDate, to)];
  if (party) { const pat = `%${escLike(party)}%`; seedConds.push(sql`${schema.extYarnSalVoucher.party} LIKE ${pat} ESCAPE '\\'`); }
  if (count) seedConds.push(eq(schema.extYarnSalVoucherLine.count, count));
  const seedAgg = await db
    .select({
      party: schema.extYarnSalVoucher.party,
      count: schema.extYarnSalVoucherLine.count,
      bags: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.bag}), 0)`,
      lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)`,
      amt: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.amt}), 0)`,
    })
    .from(schema.extYarnSalVoucherLine)
    .innerJoin(schema.extYarnSalVoucher, eq(schema.extYarnSalVoucherLine.voucherId, schema.extYarnSalVoucher.id))
    .where(and(...seedConds))
    .groupBy(schema.extYarnSalVoucher.party, schema.extYarnSalVoucherLine.count);

  // Consumed — packi-parchi count consumption, by sale party + count.
  const consConds = [gte(schema.extPackiParchi.vDate, from), lte(schema.extPackiParchi.vDate, to)];
  if (party) { const pat = `%${escLike(party)}%`; consConds.push(sql`${schema.extPackiParchi.saleParty} LIKE ${pat} ESCAPE '\\'`); }
  if (count) consConds.push(eq(schema.extPackiParchiCount.code, count));
  const consAgg = await db
    .select({
      party: schema.extPackiParchi.saleParty,
      count: schema.extPackiParchiCount.code,
      lbs: sql<number>`coalesce(sum(${schema.extPackiParchiCount.totLbs}), 0)`,
    })
    .from(schema.extPackiParchiCount)
    .innerJoin(schema.extPackiParchi, eq(schema.extPackiParchiCount.parchiId, schema.extPackiParchi.id))
    .where(and(...consConds))
    .groupBy(schema.extPackiParchi.saleParty, schema.extPackiParchiCount.code);

  type Row = { party: string; count: string; desc: string; totalLbs: number; bags: number; consumedLbs: number; balLbs: number; rate: number; amount: number };
  const map = new Map<string, Row>();
  const key = (pt: string, c: string) => `${pt}||${c}`;
  for (const s of seedAgg) {
    const pt = s.party ?? "—", c = s.count ?? "—";
    map.set(key(pt, c), {
      party: pt, count: c, desc: descByCode.get(c) ?? "",
      totalLbs: s.lbs, bags: s.bags, consumedLbs: 0, balLbs: 0,
      rate: s.lbs > 0 ? s.amt / s.lbs : 0, amount: 0,
    });
  }
  for (const cs of consAgg) {
    const pt = cs.party ?? "—", c = cs.count ?? "—";
    const k = key(pt, c);
    const r = map.get(k) ?? { party: pt, count: c, desc: descByCode.get(c) ?? "", totalLbs: 0, bags: 0, consumedLbs: 0, balLbs: 0, rate: 0, amount: 0 };
    r.consumedLbs += cs.lbs;
    map.set(k, r);
  }
  const rows = Array.from(map.values());
  for (const r of rows) {
    r.balLbs = r.totalLbs - r.consumedLbs;
    r.amount = r.balLbs * r.rate;
  }
  rows.sort((a, b) => a.party.localeCompare(b.party) || a.count.localeCompare(b.count));

  // Group by party for display (party header → count rows → party subtotal).
  const byParty = new Map<string, Row[]>();
  for (const r of rows) (byParty.get(r.party) ?? byParty.set(r.party, []).get(r.party)!).push(r);

  const grand = rows.reduce(
    (t, r) => ({ totalLbs: t.totalLbs + r.totalLbs, bags: t.bags + r.bags, consumedLbs: t.consumedLbs + r.consumedLbs, balLbs: t.balLbs + r.balLbs, amount: t.amount + r.amount }),
    { totalLbs: 0, bags: 0, consumedLbs: 0, balLbs: 0, amount: 0 }
  );

  const ledgerHref = (pt: string, c: string) =>
    `/reports/weaving/count-report/ledger?party=${encodeURIComponent(pt)}&count=${encodeURIComponent(c)}&from=${from}&to=${to}`;

  return (
    <Shell active="w-count-report">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Weaving Counts Accounts Report</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {byParty.size} part{byParty.size === 1 ? "y" : "ies"} · {rows.length} count rows · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                party: r.party, count: r.count, description: r.desc,
                totalLbs: Math.round(r.totalLbs), bags: r.bags,
                consumedLbs: Math.round(r.consumedLbs), balLbs: Math.round(r.balLbs),
                rate: Number(r.rate.toFixed(2)), amount: Math.round(r.amount),
              }))}
              columns={[
                { key: "party", label: "Party" },
                { key: "count", label: "Count" },
                { key: "description", label: "Count Desc" },
                { key: "totalLbs", label: "Total Lbs" },
                { key: "bags", label: "Bags" },
                { key: "consumedLbs", label: "Consumed Lbs" },
                { key: "balLbs", label: "Bal Lbs" },
                { key: "rate", label: "Rate" },
                { key: "amount", label: "Amount" },
              ]}
              filename="weaving-count-report"
              sheetName="CountReport"
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
            <a href="/reports/weaving/count-report" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Count Desc</th>
                <th className="text-right">Total Lbs</th>
                <th className="text-right">Bags</th>
                <th className="text-right">Consumed Lbs</th>
                <th className="text-right">Bal Lbs</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
                <th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-[var(--muted)] py-8">No count activity in period</td></tr>
              ) : (
                Array.from(byParty.entries()).map(([pt, prows]) => {
                  const sub = prows.reduce(
                    (t, r) => ({ totalLbs: t.totalLbs + r.totalLbs, bags: t.bags + r.bags, consumedLbs: t.consumedLbs + r.consumedLbs, balLbs: t.balLbs + r.balLbs, amount: t.amount + r.amount }),
                    { totalLbs: 0, bags: 0, consumedLbs: 0, balLbs: 0, amount: 0 }
                  );
                  return (
                    <tr key={pt} className="contents">
                      <td colSpan={8} className="p-0">
                        <table className="w-full">
                          <tbody>
                            <tr style={{ background: "#0f172a", color: "white" }}>
                              <td className="font-bold text-[13px] px-2 py-1" colSpan={8}>{pt} <span className="opacity-70">· {prows.length}</span></td>
                            </tr>
                            {prows.map((r) => (
                              <tr key={r.count}>
                                <td className="text-[13px]"><span className="mono font-bold">{r.count}</span> — {r.desc || r.count}</td>
                                <td className="mono text-right">{fmt(r.totalLbs)}</td>
                                <td className="mono text-right">{fmt(r.bags)}</td>
                                <td className="mono text-right">{fmt(r.consumedLbs)}</td>
                                <td className="mono text-right font-bold">{fmt(r.balLbs)}</td>
                                <td className="mono text-right">{fmt2(r.rate)}</td>
                                <td className="mono text-right">{fmt(r.amount)}</td>
                                <td className="no-print"><a href={ledgerHref(r.party, r.count)} className="btn btn-outline btn-xs">L</a></td>
                              </tr>
                            ))}
                            <tr style={{ borderTop: "1px solid #cbd5e1", fontWeight: 700 }}>
                              <td className="text-right pr-2">Party Total</td>
                              <td className="mono text-right">{fmt(sub.totalLbs)}</td>
                              <td className="mono text-right">{fmt(sub.bags)}</td>
                              <td className="mono text-right">{fmt(sub.consumedLbs)}</td>
                              <td className="mono text-right">{fmt(sub.balLbs)}</td>
                              <td></td>
                              <td className="mono text-right">{fmt(sub.amount)}</td>
                              <td className="no-print"></td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td className="text-right pr-2">Grand Total</td>
                  <td className="mono text-right">{fmt(grand.totalLbs)}</td>
                  <td className="mono text-right">{fmt(grand.bags)}</td>
                  <td className="mono text-right">{fmt(grand.consumedLbs)}</td>
                  <td className="mono text-right">{fmt(grand.balLbs)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(grand.amount)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
