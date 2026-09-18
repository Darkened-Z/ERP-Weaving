import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq } from "drizzle-orm";
import { fmt, fmt2, escLike, sixMonthsAgo, todayIso, partyByNameOptions, yarnCountOptions } from "../../_shared";
import { DateBox } from "@/components/date-box";

// WEAVING COUNTS ACCOUNTS — party × count. Seed = yarn sold to the party
// (ext_yarn_sal_voucher, the "Yarn Sale Register"); Consumed = the yarn the
// packi-parchi conversions used for that party+count (ext_packi_parchi_count);
// Balance = Seed − Consumed. Each count links to its detail ledger.
//
// One implementation, rendered at more than one route: the mill reads the same
// figures as a SALE report and (later) as a CONVERSION one, and the difference
// belongs in the title and the nav, not in a second copy of the query.
export async function CountsAccountsReport({
  searchParams,
  title = "Weaving Counts Accounts Report",
  navKey = "w-count-report",
  partyScope = "activity",
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string }>;
  /**
   * Which parties the report is about.
   *
   * "activity" (default) lists whoever actually moved yarn in the period.
   * "grey-sale-contract" is the Sale side as the mill defines it: the parties
   * named on an EXTERNAL grey conversion contract of type SALE, each shown with
   * every count they are set up with in Party Count — so a party the mill is
   * committed to appears with zeros rather than not appearing at all.
   */
  partyScope?: "activity" | "grey-sale-contract";
  title?: string;
  navKey?: string;
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
  // "21 — 36/s" does not say what the yarn is. The blend belongs with it, so the
  // label is description + fibre type, the same pairing every other screen uses.
  const descByCode = new Map(
    allCounts.map((c) => [c.countCode, `${c.description ?? ""}${c.type ? ` ${c.type}` : ""}`.trim()]),
  );

  // Seed — yarn sold to the party, by party + count.
  const seedConds = [gte(schema.extYarnSalVoucher.vDate, from), lte(schema.extYarnSalVoucher.vDate, to)];
  if (party) { const pat = `%${escLike(party)}%`; seedConds.push(sql`${schema.extYarnSalVoucher.party} LIKE ${pat} ESCAPE '\\'`); }
  if (count) seedConds.push(eq(schema.extYarnSalVoucherLine.count, count));
  const seedAgg = await db
    .select({
      party: schema.extYarnSalVoucher.party,
      count: schema.extYarnSalVoucherLine.count,
      // Bags DERIVED at 100 lbs to a bag. The stored bag column is blank on every
      // live sale row, which is why this column read 0 all the way down.
      bags: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0) / 100.0`,
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

  // Yarn also reaches a party through the PURCHASE side — a return comes back
  // that way — so the seed is both books added together, not the sale side
  // alone. Kept as two visible columns so it is always clear which book a
  // figure came out of.
  const purConds = [gte(schema.extYarnPurVoucher.vDate, from), lte(schema.extYarnPurVoucher.vDate, to)];
  if (party) { const pat = `%${escLike(party)}%`; purConds.push(sql`${schema.extYarnPurVoucher.party} LIKE ${pat} ESCAPE '\\'`); }
  if (count) purConds.push(eq(schema.extYarnPurVoucherLine.count, count));
  const purAgg = await db
    .select({
      party: schema.extYarnPurVoucher.party,
      count: schema.extYarnPurVoucherLine.count,
      lbs: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs}), 0)`,
      amt: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs} * ${schema.extYarnPurVoucherLine.rate}), 0)`,
    })
    .from(schema.extYarnPurVoucherLine)
    .innerJoin(schema.extYarnPurVoucher, eq(schema.extYarnPurVoucherLine.voucherId, schema.extYarnPurVoucher.id))
    .where(and(...purConds))
    .groupBy(schema.extYarnPurVoucher.party, schema.extYarnPurVoucherLine.count);

  type Row = { party: string; count: string; desc: string; purLbs: number; salLbs: number; totalLbs: number; bags: number; consumedLbs: number; balLbs: number; rate: number; amount: number };
  // The Sale side starts from the commitment, not from the movement: every
  // party on a SALE-type external grey conversion contract, crossed with every
  // count that party is set up with in Party Count. Those rows exist whether or
  // not any yarn has moved yet, which is the point — a party with nothing
  // against it is exactly what the mill needs to see.
  const scopedSeedRows: { party: string; count: string }[] = [];
  let scopedParties: Set<string> | null = null;
  if (partyScope === "grey-sale-contract") {
    const saleContracts = await db
      .select({ party: schema.extGreyConvContract.party })
      .from(schema.extGreyConvContract)
      .where(sql`upper(coalesce(${schema.extGreyConvContract.type}, '')) = 'SALE'`);
    const contractParties = Array.from(
      new Set(saleContracts.map((r) => (r.party ?? "").trim()).filter(Boolean)),
    ).filter((pt) => !party || pt.toLowerCase().includes(party.toLowerCase()));
    scopedParties = new Set(contractParties);
    if (contractParties.length) {
      const coa = await db
        .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
        .from(schema.chartOfAccounts);
      const codeByDesc = new Map(coa.map((a) => [(a.description ?? "").trim(), a.code]));
      const pcRows = await db.select().from(schema.partyCounts);
      // party_counts.count_code holds the yarn_counts PK on most rows and the
      // visible code on a few, so both are tried — the same fallback the yarn
      // vouchers use.
      const codeById = new Map(allCounts.map((c) => [c.id, String(c.countCode)]));
      for (const pt of contractParties) {
        const partyCode = codeByDesc.get(pt);
        if (!partyCode) continue;
        for (const pc of pcRows) {
          if (pc.partyCode !== partyCode) continue;
          const cc = codeById.get(pc.countCode as unknown as number) ?? String(pc.countCode);
          if (count && cc !== count) continue;
          scopedSeedRows.push({ party: pt, count: cc });
        }
      }
    }
  }

  const map = new Map<string, Row>();
  const key = (pt: string, c: string) => `${pt}||${c}`;
  const blank = (pt: string, c: string): Row => ({
    party: pt, count: c, desc: descByCode.get(c) ?? "",
    purLbs: 0, salLbs: 0, totalLbs: 0, bags: 0, consumedLbs: 0, balLbs: 0, rate: 0, amount: 0,
  });
  let seedValue = 0;
  // Rate is what the BAGS WERE BOUGHT AT, so it is weighted over the purchase
  // book alone — a sale is yarn going out, not a second purchase at a new price.
  const purValueByKey = new Map<string, number>();
  const valueByKey = new Map<string, number>();
  for (const sr of scopedSeedRows) map.set(key(sr.party, sr.count), blank(sr.party, sr.count));
  for (const s of seedAgg) {
    const pt = s.party ?? "—", c = s.count ?? "—";
    const k = key(pt, c);
    const r = map.get(k) ?? blank(pt, c);
    r.salLbs += s.lbs;
    valueByKey.set(k, (valueByKey.get(k) ?? 0) + s.amt);
    map.set(k, r);
  }
  for (const pu of purAgg) {
    const pt = pu.party ?? "—", c = pu.count ?? "—";
    const k = key(pt, c);
    const r = map.get(k) ?? blank(pt, c);
    r.purLbs += pu.lbs;
    purValueByKey.set(k, (purValueByKey.get(k) ?? 0) + pu.amt);
    valueByKey.set(k, (valueByKey.get(k) ?? 0) + pu.amt);
    map.set(k, r);
  }
  for (const cs of consAgg) {
    const pt = cs.party ?? "—", c = cs.count ?? "—";
    const k = key(pt, c);
    const r = map.get(k) ?? blank(pt, c);
    r.consumedLbs += cs.lbs;
    map.set(k, r);
  }
  for (const [k, r] of map) {
    // Purchase brings yarn IN, sale takes it OUT — the mill's own register shows
    // a sale as a negative bag figure and totals the two. In 500, out 100,
    // total 400. Adding them would have doubled a return instead of cancelling
    // the yarn it sent back.
    r.totalLbs = r.purLbs - r.salLbs;
    r.bags = r.totalLbs / 100;
    const purVal = purValueByKey.get(k) ?? 0;
    r.rate = r.purLbs > 0 ? purVal / r.purLbs : 0;
    seedValue += valueByKey.get(k) ?? 0;
  }
  void seedValue;
  // Outside the scope the mill asked for, a row is noise: the Sale report is
  // about the parties committed on a SALE contract, not everyone who happened
  // to move yarn.
  const rows = Array.from(map.values())
    .filter((r) => !scopedParties || scopedParties.has(r.party))
    // A Party Count row whose count code does not resolve shows as "— — —" with
    // zeros the whole way across; it is a broken master row, not a figure.
    .filter((r) => r.count && r.count !== "—");
  for (const r of rows) {
    r.balLbs = r.totalLbs - r.consumedLbs;
    r.amount = r.balLbs * r.rate;
  }
  rows.sort((a, b) => a.party.localeCompare(b.party) || a.count.localeCompare(b.count));

  // Group by party for display (party header → count rows → party subtotal).
  const byParty = new Map<string, Row[]>();
  for (const r of rows) (byParty.get(r.party) ?? byParty.set(r.party, []).get(r.party)!).push(r);

  const grand = rows.reduce(
    (t, r) => ({ purLbs: t.purLbs + r.purLbs, salLbs: t.salLbs + r.salLbs, totalLbs: t.totalLbs + r.totalLbs, bags: t.bags + r.bags, consumedLbs: t.consumedLbs + r.consumedLbs, balLbs: t.balLbs + r.balLbs, amount: t.amount + r.amount }),
    { purLbs: 0, salLbs: 0, totalLbs: 0, bags: 0, consumedLbs: 0, balLbs: 0, amount: 0 }
  );

  // Bags open their own detail, the way L opens the count ledger: the yarn
  // movement behind the figure — every purchase that brought bags in and every
  // sale that took them out, for this party and count.
  const bagsHref = (pt: string, c: string) =>
    `/reports/yarn/sale-register?party=${encodeURIComponent(pt)}&count=${encodeURIComponent(c)}&from=${from}&to=${to}`;
  const ledgerHref = (pt: string, c: string) =>
    `/reports/weaving/count-report/ledger?party=${encodeURIComponent(pt)}&count=${encodeURIComponent(c)}&from=${from}&to=${to}`;

  return (
    <Shell active={navKey}>
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {byParty.size} part{byParty.size === 1 ? "y" : "ies"} · {rows.length} count rows · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                party: r.party, count: r.count, description: r.desc,
                purLbs: Math.round(r.purLbs), salLbs: Math.round(r.salLbs),
                totalLbs: Math.round(r.totalLbs), bags: r.bags,
                consumedLbs: Math.round(r.consumedLbs), balLbs: Math.round(r.balLbs),
                rate: Number(r.rate.toFixed(2)), amount: Math.round(r.amount),
              }))}
              columns={[
                { key: "party", label: "Party" },
                { key: "count", label: "Count" },
                { key: "description", label: "Count Desc" },
                { key: "purLbs", label: "Pur Lbs" },
                { key: "salLbs", label: "Sale Lbs (out)" },
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
                <th className="text-right">Pur Lbs</th>
                <th className="text-right">Sale Lbs (out)</th>
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
                <tr>
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
                    {partyScope === "grey-sale-contract" && (scopedParties?.size ?? 0) === 0
                      ? "No external grey conversion contract is set to type SALE, so there are no parties to report. Set a contract's type to SALE and its parties appear here with their Party Counts."
                      : "No count activity in period"}
                  </td>
                </tr>
              ) : (
                Array.from(byParty.entries()).map(([pt, prows]) => {
                  const sub = prows.reduce(
                    (t, r) => ({ purLbs: t.purLbs + r.purLbs, salLbs: t.salLbs + r.salLbs, totalLbs: t.totalLbs + r.totalLbs, bags: t.bags + r.bags, consumedLbs: t.consumedLbs + r.consumedLbs, balLbs: t.balLbs + r.balLbs, amount: t.amount + r.amount }),
                    { purLbs: 0, salLbs: 0, totalLbs: 0, bags: 0, consumedLbs: 0, balLbs: 0, amount: 0 }
                  );
                  return (
                    <tr key={pt} className="contents">
                      <td colSpan={10} className="p-0">
                        <table className="w-full">
                          <tbody>
                            <tr style={{ background: "#0f172a", color: "white" }}>
                              <td className="font-bold text-[13px] px-2 py-1" colSpan={10}>
                                {pt} <span className="opacity-70">· {prows.length}</span>
                                {/* The whole party's yarn movement, every count at
                                    once — the register the mill reads per party. */}
                                <a
                                  href={`/reports/yarn/sale-register?party=${encodeURIComponent(pt)}&from=${from}&to=${to}`}
                                  className="ml-3 underline text-[11px] font-normal no-print"
                                  style={{ color: "#93c5fd" }}
                                  title="Open this party's yarn register — purchases in, sales out, all counts"
                                >
                                  Yarn Register
                                </a>
                              </td>
                            </tr>
                            {prows.map((r) => (
                              <tr key={r.count}>
                                <td className="text-[13px]"><span className="mono font-bold">{r.count}</span> — {r.desc || r.count}</td>
                                <td className="mono text-right">{fmt(r.purLbs)}</td>
                                <td className="mono text-right">{fmt(r.salLbs)}</td>
                                <td className="mono text-right">{fmt(r.totalLbs)}</td>
                                <td className="mono text-right">
                                  {r.bags !== 0 ? (
                                    <a
                                      href={bagsHref(r.party, r.count)}
                                      className="underline"
                                      title="Open the bags detail — purchases in, sales out"
                                    >
                                      {fmt(r.bags)}
                                    </a>
                                  ) : (
                                    fmt(r.bags)
                                  )}
                                </td>
                                <td className="mono text-right">{fmt(r.consumedLbs)}</td>
                                <td className="mono text-right font-bold">{fmt(r.balLbs)}</td>
                                <td className="mono text-right">{fmt2(r.rate)}</td>
                                <td className="mono text-right">{fmt(r.amount)}</td>
                                <td className="no-print"><a href={ledgerHref(r.party, r.count)} className="btn btn-outline btn-xs">L</a></td>
                              </tr>
                            ))}
                            <tr style={{ borderTop: "1px solid #cbd5e1", fontWeight: 700 }}>
                              <td className="text-right pr-2">Party Total</td>
                              <td className="mono text-right">{fmt(sub.purLbs)}</td>
                              <td className="mono text-right">{fmt(sub.salLbs)}</td>
                              <td className="mono text-right">{fmt(sub.totalLbs)}</td>
                              <td className="mono text-right">
                                {sub.bags !== 0 ? (
                                  <a
                                    href={`/reports/yarn/sale-register?party=${encodeURIComponent(pt)}&from=${from}&to=${to}`}
                                    className="underline"
                                    title="Open this party's yarn register — all counts"
                                  >
                                    {fmt(sub.bags)}
                                  </a>
                                ) : (
                                  fmt(sub.bags)
                                )}
                              </td>
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
                  <td className="mono text-right">{fmt(grand.purLbs)}</td>
                  <td className="mono text-right">{fmt(grand.salLbs)}</td>
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
