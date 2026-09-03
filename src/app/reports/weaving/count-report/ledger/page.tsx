import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq, inArray } from "drizzle-orm";
import { fmt, fmt2, escLike, sixMonthsAgo, todayIso } from "../../../_shared";

export const dynamic = "force-dynamic";

// Detail ledger for one party + count: the seed (yarn sold to the party) vs every
// packi-parchi conversion that consumed that count (warp/weft lbs, than, meters,
// rate), with a Seed / Consumed / Balance summary. Mirrors the Oracle count ledger.
export default async function WeavingCountLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ party?: string; count?: string; from?: string; to?: string }>;
}) {
  const p = await searchParams;
  const party = p.party?.trim() ?? "";
  const count = p.count?.trim() ?? "";
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const pat = `%${escLike(party)}%`;

  const countMeta = count
    ? (await db.select().from(schema.yarnCounts).where(eq(schema.yarnCounts.countCode, count)))[0]
    : undefined;

  // Seed — yarn sold to this party for this count.
  const seedRow = party
    ? (
        await db
          .select({
            bags: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.bag}), 0)`,
            lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)`,
            amt: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.amt}), 0)`,
          })
          .from(schema.extYarnSalVoucherLine)
          .innerJoin(schema.extYarnSalVoucher, eq(schema.extYarnSalVoucherLine.voucherId, schema.extYarnSalVoucher.id))
          .where(and(
            sql`${schema.extYarnSalVoucher.party} LIKE ${pat} ESCAPE '\\'`,
            eq(schema.extYarnSalVoucherLine.count, count),
            gte(schema.extYarnSalVoucher.vDate, from),
            lte(schema.extYarnSalVoucher.vDate, to),
          ))
      )[0]
    : undefined;
  const seedBags = seedRow?.bags ?? 0;
  const seedLbs = seedRow?.lbs ?? 0;
  const seedAmt = seedRow?.amt ?? 0;
  const seedRate = seedLbs > 0 ? seedAmt / seedLbs : 0;

  // Packi conversions of this party in period, then their count rows for this count.
  const packis = party
    ? await db
        .select({
          id: schema.extPackiParchi.id,
          vNo: schema.extPackiParchi.vNo,
          vDate: schema.extPackiParchi.vDate,
          quality: schema.extPackiParchi.quality,
          than: schema.extPackiParchi.than,
          meterNet: schema.extPackiParchi.meterNet,
          conv: schema.extPackiParchi.convContSale2,
          sale: schema.extPackiParchi.convContNoSale,
        })
        .from(schema.extPackiParchi)
        .where(and(
          sql`${schema.extPackiParchi.saleParty} LIKE ${pat} ESCAPE '\\'`,
          gte(schema.extPackiParchi.vDate, from),
          lte(schema.extPackiParchi.vDate, to),
        ))
        .orderBy(schema.extPackiParchi.vDate)
    : [];
  const ids = packis.map((x) => x.id);
  const cntRows = ids.length
    ? await db
        .select()
        .from(schema.extPackiParchiCount)
        .where(and(inArray(schema.extPackiParchiCount.parchiId, ids), eq(schema.extPackiParchiCount.code, count)))
    : [];

  const byParchi = new Map<number, typeof cntRows>();
  for (const c of cntRows) (byParchi.get(c.parchiId) ?? byParchi.set(c.parchiId, []).get(c.parchiId)!).push(c);

  type Line = { vNo: string; date: string; cont: string; quality: string; descr: string; brand: string; than: number; meters: number; warpLbs: number; weftLbs: number; totLbs: number; rate: number };
  const lines: Line[] = [];
  for (const pk of packis) {
    const cs = byParchi.get(pk.id);
    if (!cs || !cs.length) continue;
    let warpLbs = 0, weftLbs = 0, rate = 0, descr = "", brand = "";
    for (const c of cs) {
      const t = c.totLbs ?? 0;
      if ((c.type ?? "").toUpperCase().includes("WEFT")) weftLbs += t; else warpLbs += t;
      if (c.ratePerLbs) rate = c.ratePerLbs;
      if (!descr && c.descr) descr = c.descr;
      if (!brand && c.brand) brand = c.brand;
    }
    lines.push({
      vNo: pk.vNo, date: pk.vDate, cont: pk.conv || pk.sale || "", quality: pk.quality ?? "",
      descr, brand, than: pk.than ?? 0, meters: pk.meterNet ?? 0,
      warpLbs, weftLbs, totLbs: warpLbs + weftLbs, rate,
    });
  }

  const consumedLbs = lines.reduce((s, l) => s + l.totLbs, 0);
  const consumedAmt = lines.reduce((s, l) => s + l.totLbs * l.rate, 0);
  const balLbs = seedLbs - consumedLbs;
  const grand = lines.reduce(
    (a, l) => ({
      than: a.than + l.than, meters: a.meters + l.meters,
      warpLbs: a.warpLbs + l.warpLbs, weftLbs: a.weftLbs + l.weftLbs, totLbs: a.totLbs + l.totLbs,
    }),
    { than: 0, meters: 0, warpLbs: 0, weftLbs: 0, totLbs: 0 },
  );

  // Group by conversion contract (Oracle CONV.C# layout): each contract's rows + a
  // CONV.C# TOTAL subtotal, then the grand Consumed Total footer.
  const byCont = new Map<string, Line[]>();
  for (const l of lines) {
    const k = l.cont || "—";
    (byCont.get(k) ?? byCont.set(k, []).get(k)!).push(l);
  }
  const contGroups = Array.from(byCont.entries()).map(([cont, rows]) => ({
    cont,
    rows,
    sub: rows.reduce(
      (a, r) => ({
        than: a.than + r.than, meters: a.meters + r.meters,
        warpLbs: a.warpLbs + r.warpLbs, weftLbs: a.weftLbs + r.weftLbs,
        totLbs: a.totLbs + r.totLbs, amount: a.amount + r.totLbs * r.rate,
      }),
      { than: 0, meters: 0, warpLbs: 0, weftLbs: 0, totLbs: 0, amount: 0 },
    ),
  }));

  return (
    <Shell active="w-count-report">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">Count Ledger — {party}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Count <span className="mono font-bold">{count}</span>{countMeta?.description ? ` — ${countMeta.description}` : ""} · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <a href={`/reports/weaving/count-report?from=${from}&to=${to}`} className="btn btn-outline btn-sm">Back</a>
          </div>
        </div>

        {/* Seed / Consumed / Balance summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">Seed (Yarn Sold)</div>
            <div className="mono text-[15px] font-bold mt-1">{fmt(seedLbs)} lbs</div>
            <div className="mono text-[12px] text-[var(--muted)]">{fmt(seedBags)} bags @ {fmt2(seedRate)}</div>
          </div>
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">Consumed</div>
            <div className="mono text-[15px] font-bold mt-1">{fmt(consumedLbs)} lbs</div>
            <div className="mono text-[12px] text-[var(--muted)]">{fmt(consumedAmt)} amt</div>
          </div>
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">Balance</div>
            <div className="mono text-[15px] font-bold mt-1">{fmt(balLbs)} lbs</div>
          </div>
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">Value @ Seed Rate</div>
            <div className="mono text-[15px] font-bold mt-1">{fmt(balLbs * seedRate)}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>V.No</th>
                <th>Date</th>
                <th>Contract</th>
                <th>Quality</th>
                <th>Desc</th>
                <th>Brand</th>
                <th className="text-right">Than</th>
                <th className="text-right">Meters</th>
                <th className="text-right">Warp Lbs</th>
                <th className="text-right">Weft Lbs</th>
                <th className="text-right">Tot Lbs</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={13} className="text-center text-[var(--muted)] py-8">No consumption for this party + count in period</td></tr>
              ) : (
                contGroups.flatMap((g) => [
                  <tr key={`h-${g.cont}`} style={{ background: "#0f172a", color: "white" }}>
                    <td colSpan={13} className="mono font-bold text-[12px] px-2 py-1">CONV.C# {g.cont}</td>
                  </tr>,
                  ...g.rows.map((l, i) => (
                    <tr key={`${g.cont}-${l.vNo}-${i}`}>
                      <td className="mono text-[12px] font-bold">{l.vNo}</td>
                      <td className="mono text-[12px]">{l.date}</td>
                      <td className="mono text-[12px]">{l.cont || "—"}</td>
                      <td className="mono text-[12px]">{l.quality || "—"}</td>
                      <td className="text-[12px]">{l.descr || "—"}</td>
                      <td className="text-[12px]">{l.brand || "—"}</td>
                      <td className="mono text-right">{fmt(l.than)}</td>
                      <td className="mono text-right">{fmt(l.meters)}</td>
                      <td className="mono text-right">{fmt2(l.warpLbs)}</td>
                      <td className="mono text-right">{fmt2(l.weftLbs)}</td>
                      <td className="mono text-right font-bold">{fmt2(l.totLbs)}</td>
                      <td className="mono text-right">{fmt2(l.rate)}</td>
                      <td className="mono text-right">{fmt(l.totLbs * l.rate)}</td>
                    </tr>
                  )),
                  <tr key={`s-${g.cont}`} style={{ background: "#f1f5f9", fontWeight: 700 }}>
                    <td colSpan={6} className="text-right pr-2">CONV.C# TOTAL</td>
                    <td className="mono text-right">{fmt(g.sub.than)}</td>
                    <td className="mono text-right">{fmt(g.sub.meters)}</td>
                    <td className="mono text-right">{fmt2(g.sub.warpLbs)}</td>
                    <td className="mono text-right">{fmt2(g.sub.weftLbs)}</td>
                    <td className="mono text-right">{fmt2(g.sub.totLbs)}</td>
                    <td></td>
                    <td className="mono text-right">{fmt(g.sub.amount)}</td>
                  </tr>,
                ])
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={6} className="text-right pr-2">GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(grand.than)}</td>
                  <td className="mono text-right">{fmt(grand.meters)}</td>
                  <td className="mono text-right">{fmt2(grand.warpLbs)}</td>
                  <td className="mono text-right">{fmt2(grand.weftLbs)}</td>
                  <td className="mono text-right">{fmt2(grand.totLbs)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(consumedAmt)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
