import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq, inArray } from "drizzle-orm";
import { fmt, fmt2, escLike, sixMonthsAgo, todayIso } from "../../../_shared";
import { countLabelMap, normQuality, richConstruction } from "@/lib/grey-quality";

export const dynamic = "force-dynamic";

// Lbs/M figures are small fractions (e.g. 0.2085) — show 4 decimals.
const fmt4 = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(n);

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
          printingName: schema.extPackiParchi.printingName,
          ppNo: schema.extPackiParchi.ppNo,
          qualityPrint: schema.extPackiParchi.qualityPrint,
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

  type Line = {
    vNo: string; date: string; cont: string; quality: string; descr: string; brand: string; dying: string;
    bookNo: string; product: string;
    than: number; meters: number; warpLbs: number; weftLbs: number; totLbs: number; rate: number;
    warpCal: number; weftCal: number; warpEnds: number; weftEnds: number;
    warpWtM: number; weftWtM: number; resulted: number;
  };
  const lines: Line[] = [];
  for (const pk of packis) {
    const cs = byParchi.get(pk.id);
    if (!cs || !cs.length) continue;
    let warpLbs = 0, weftLbs = 0, rate = 0, descr = "", brand = "";
    let warpCal = 0, weftCal = 0, warpEnds = 0, weftEnds = 0, warpWtM = 0, weftWtM = 0, resulted = 0;
    for (const c of cs) {
      const t = c.totLbs ?? 0;
      const isWeft = (c.type ?? "").toUpperCase().includes("WEFT");
      if (isWeft) {
        weftLbs += t;
        weftCal = c.calCount ?? weftCal; weftEnds += c.ends ?? 0; weftWtM = c.wtPerMtr ?? weftWtM;
      } else {
        warpLbs += t;
        warpCal = c.calCount ?? warpCal; warpEnds += c.ends ?? 0; warpWtM = c.wtPerMtr ?? warpWtM;
      }
      // Oracle "Resulted Count" = TOT Lbs × Cal Count ÷ Seed Lbs (consumption as a
      // share of the yarn sent, in count units — a fully consumed seed sums to the
      // count itself). Verified against the client report: seed 16000 @36 → ÷444.4.
      if (seedLbs > 0) resulted += (t * (c.calCount ?? 0)) / seedLbs;
      if (c.ratePerLbs) rate = c.ratePerLbs;
      if (!descr && c.descr) descr = c.descr;
      if (!brand && c.brand) brand = c.brand;
    }
    lines.push({
      vNo: pk.vNo, date: pk.vDate, cont: pk.conv || pk.sale || "", quality: pk.quality ?? "",
      descr, brand, dying: pk.printingName ?? "", bookNo: pk.ppNo ?? "",
      product: pk.qualityPrint ?? "", than: pk.than ?? 0, meters: pk.meterNet ?? 0,
      warpLbs, weftLbs, totLbs: warpLbs + weftLbs, rate,
      warpCal, weftCal, warpEnds, weftEnds, warpWtM, weftWtM, resulted,
    });
  }

  const consumedLbs = lines.reduce((s, l) => s + l.totLbs, 0);
  const consumedAmt = lines.reduce((s, l) => s + l.totLbs * l.rate, 0);
  const balLbs = seedLbs - consumedLbs;
  const grand = lines.reduce(
    (a, l) => ({
      than: a.than + l.than, meters: a.meters + l.meters,
      warpLbs: a.warpLbs + l.warpLbs, weftLbs: a.weftLbs + l.weftLbs, totLbs: a.totLbs + l.totLbs,
      resulted: a.resulted + l.resulted,
    }),
    { than: 0, meters: 0, warpLbs: 0, weftLbs: 0, totLbs: 0, resulted: 0 },
  );

  // Group by conversion contract (Oracle CONV.C# layout): each contract's rows + a
  // CONV.C# TOTAL subtotal, then the grand Consumed Total footer.
  const byCont = new Map<string, Line[]>();
  for (const l of lines) {
    const k = l.cont || "—";
    (byCont.get(k) ?? byCont.set(k, []).get(k)!).push(l);
  }
  // Contract-level info auto from the conversion / sale contract (Oracle block
  // header): construction, Lbs/M warp/weft, conv rate.
  const contNos = Array.from(byCont.keys()).filter((k) => k !== "—");
  const convContracts = contNos.length
    ? await db
        .select({
          contNo: schema.extGreyConvContract.contNo,
          grayQltyCode: schema.extGreyConvContract.grayQltyCode,
          grayCode: schema.extGreyConvContract.grayCode,
          warpWtPerMtr: schema.extGreyConvContract.warpWtPerMtr,
          weftWtPerMtr: schema.extGreyConvContract.weftWtPerMtr,
          wtPerMtr: schema.extGreyConvContract.wtPerMtr,
          convRatePerMtr: schema.extGreyConvContract.convRatePerMtr,
          grayRatePerMtr: schema.extGreyConvContract.grayRatePerMtr,
          rateMtr: schema.extGreyConvContract.rateMtr,
          qtyMtr: schema.extGreyConvContract.qtyMtr,
        })
        .from(schema.extGreyConvContract)
        .where(inArray(schema.extGreyConvContract.contNo, contNos))
    : [];
  const salContracts = contNos.length
    ? await db
        .select({
          contractNo: schema.extGreySalContract.contractNo,
          greyCode: schema.extGreySalContract.greyCode,
          ratePerMtr: schema.extGreySalContract.ratePerMtr,
          quantityMtr: schema.extGreySalContract.quantityMtr,
        })
        .from(schema.extGreySalContract)
        .where(inArray(schema.extGreySalContract.contractNo, contNos))
    : [];
  const constrRows = await db.select().from(schema.greyConstruction);
  const constrByCode = new Map(constrRows.map((c) => [c.code, c]));
  const constrCodes = new Set(constrRows.map((c) => c.code));
  const countRows = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts);
  const countLabels = countLabelMap(countRows);
  const richFull = (q: string | null | undefined) => {
    const code = normQuality(q, constrCodes);
    const c = code ? constrByCode.get(code) : undefined;
    return c ? richConstruction(c, countLabels) : "";
  };
  type ContInfo = { construction: string; wrpM: number | null; wftM: number | null; totM: number | null; convRate: number | null; qtyMtr: number | null };
  const contInfo = new Map<string, ContInfo>();
  for (const c of convContracts) {
    contInfo.set(c.contNo, {
      construction: richFull(c.grayQltyCode ?? c.grayCode),
      wrpM: c.warpWtPerMtr, wftM: c.weftWtPerMtr, totM: c.wtPerMtr,
      convRate: c.convRatePerMtr ?? c.grayRatePerMtr ?? c.rateMtr,
      qtyMtr: c.qtyMtr,
    });
  }
  for (const c of salContracts) {
    if (contInfo.has(c.contractNo)) continue;
    contInfo.set(c.contractNo, {
      construction: richFull(c.greyCode),
      wrpM: null, wftM: null, totM: null,
      convRate: c.ratePerMtr, qtyMtr: c.quantityMtr,
    });
  }

  const contGroups = Array.from(byCont.entries()).map(([cont, rows]) => {
    const base = contInfo.get(cont) ?? { construction: richFull(rows[0]?.quality), wrpM: null, wftM: null, totM: null, convRate: null, qtyMtr: null };
    // Ends / Lbs/M actuals come from the packi count rows (first row that has them);
    // the contract's wt-per-mtr is the fallback when the parchi rows carry none.
    const first = rows.find((r) => r.warpEnds || r.weftEnds) ?? rows[0];
    return {
      cont,
      info: {
        ...base,
        wrpM: first?.warpWtM || base.wrpM,
        wftM: first?.weftWtM || base.wftM,
        warpEnds: first?.warpEnds ?? 0,
        weftEnds: first?.weftEnds ?? 0,
        rateLbs: rows.find((r) => r.rate)?.rate ?? 0,
      },
      rows,
      sub: rows.reduce(
        (a, r) => ({
          than: a.than + r.than, meters: a.meters + r.meters,
          warpLbs: a.warpLbs + r.warpLbs, weftLbs: a.weftLbs + r.weftLbs,
          totLbs: a.totLbs + r.totLbs, resulted: a.resulted + r.resulted,
          amount: a.amount + r.totLbs * r.rate,
        }),
        { than: 0, meters: 0, warpLbs: 0, weftLbs: 0, totLbs: 0, resulted: 0, amount: 0 },
      ),
    };
  });

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
          <table style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                <th>V.No / Book</th>
                <th>Date</th>
                <th>Dying</th>
                <th>Product</th>
                <th className="text-right">C.Cnt Wrp</th>
                <th className="text-right">C.Cnt Wft</th>
                <th className="text-right">Than</th>
                <th className="text-right">Meters</th>
                <th className="text-right">Warp Lbs</th>
                <th className="text-right">Weft Lbs</th>
                <th className="text-right">Tot Lbs</th>
                <th className="text-right">Resulted Cnt</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={14} className="text-center text-[var(--muted)] py-8">No consumption for this party + count in period</td></tr>
              ) : (
                contGroups.flatMap((g) => [
                  <tr key={`h-${g.cont}`} style={{ background: "#0f172a", color: "white" }}>
                    <td colSpan={14} className="mono font-bold text-[12px] px-2 py-1">
                      <span>CONV.C# {g.cont}</span>
                      {g.info.construction && <span className="ml-3 font-normal">{g.info.construction}</span>}
                      {g.info.convRate != null && <span className="float-right font-normal">Conv Rate {fmt2(g.info.convRate)}</span>}
                    </td>
                  </tr>,
                  <tr key={`h2-${g.cont}`} style={{ background: "#e2e8f0" }}>
                    <td colSpan={14} className="mono text-[11px] px-2 py-1">
                      Ends W/W/T{" "}
                      <span className="font-bold">
                        {fmt(g.info.warpEnds)} / {fmt(g.info.weftEnds)} / {fmt(g.info.warpEnds + g.info.weftEnds)}
                      </span>
                      {(g.info.wrpM != null || g.info.wftM != null) && (
                        <span className="ml-4">
                          Lbs/M Wrp <span className="font-bold">{fmt4(g.info.wrpM)}</span> / Wft{" "}
                          <span className="font-bold">{fmt4(g.info.wftM)}</span>
                        </span>
                      )}
                      {g.info.rateLbs > 0 && (
                        <span className="ml-4">Rate/Lbs <span className="font-bold">{fmt2(g.info.rateLbs)}</span></span>
                      )}
                      {g.info.qtyMtr != null && (
                        <span className="float-right">Cont Qty {fmt(g.info.qtyMtr)} mtr</span>
                      )}
                    </td>
                  </tr>,
                  ...g.rows.map((l, i) => (
                    <tr key={`${g.cont}-${l.vNo}-${i}`}>
                      <td className="mono text-[12px] font-bold">
                        {l.vNo}
                        {l.bookNo && <div className="font-normal text-[10px] text-[var(--muted)]">{l.bookNo}</div>}
                      </td>
                      <td className="mono text-[12px]">{l.date}</td>
                      <td className="text-[12px]">{l.dying || "—"}</td>
                      <td className="text-[12px]">{(l.product && (richFull(l.product) || l.product)) || l.descr || "—"}</td>
                      <td className="mono text-right">{l.warpCal ? fmt2(l.warpCal) : "—"}</td>
                      <td className="mono text-right">{l.weftCal ? fmt2(l.weftCal) : "—"}</td>
                      <td className="mono text-right">{fmt(l.than)}</td>
                      <td className="mono text-right">{fmt(l.meters)}</td>
                      <td className="mono text-right">{fmt2(l.warpLbs)}</td>
                      <td className="mono text-right">{fmt2(l.weftLbs)}</td>
                      <td className="mono text-right font-bold">{fmt2(l.totLbs)}</td>
                      <td className="mono text-right">{fmt4(l.resulted)}</td>
                      <td className="mono text-right">{fmt2(l.rate)}</td>
                      <td className="mono text-right">{fmt(l.totLbs * l.rate)}</td>
                    </tr>
                  )),
                  <tr key={`s-${g.cont}`} style={{ background: "#fce7f3", fontWeight: 700 }}>
                    <td colSpan={6} className="text-right pr-2">CONV.C# TOTAL</td>
                    <td className="mono text-right">{fmt(g.sub.than)}</td>
                    <td className="mono text-right">{fmt(g.sub.meters)}</td>
                    <td className="mono text-right">{fmt2(g.sub.warpLbs)}</td>
                    <td className="mono text-right">{fmt2(g.sub.weftLbs)}</td>
                    <td className="mono text-right">{fmt2(g.sub.totLbs)}</td>
                    <td className="mono text-right">{fmt4(g.sub.resulted)}</td>
                    <td></td>
                    <td className="mono text-right">{fmt(g.sub.amount)}</td>
                  </tr>,
                ])
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700, background: "#ccfbf1" }}>
                  <td colSpan={6} className="text-right pr-2">GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(grand.than)}</td>
                  <td className="mono text-right">{fmt(grand.meters)}</td>
                  <td className="mono text-right">{fmt2(grand.warpLbs)}</td>
                  <td className="mono text-right">{fmt2(grand.weftLbs)}</td>
                  <td className="mono text-right">{fmt2(grand.totLbs)}</td>
                  <td className="mono text-right">{fmt4(grand.resulted)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(consumedAmt)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* SUMMERY REPORT — Oracle footer: Send / Consumed / Balance in bags + lbs
            at the seed rate, with the party banner underneath. */}
        <div className="mt-6 flex justify-end">
          <div className="border-2 border-black" style={{ minWidth: 420 }}>
            <div className="px-3 py-1.5 border-b border-black flex justify-between items-baseline">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "#b91c1c" }}>Summery Report</span>
              <span className="mono text-[12px] font-bold">{count}{countMeta?.description ? ` ${countMeta.description}` : ""}</span>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th></th>
                  <th className="text-right">Bags</th>
                  <th className="text-right">Lbs</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-bold">Send</td>
                  <td className="mono text-right">{fmt2(seedBags)}</td>
                  <td className="mono text-right">{fmt2(seedLbs)}</td>
                  <td className="mono text-right">{fmt2(seedRate)}</td>
                  <td className="mono text-right">{fmt(seedAmt)}</td>
                </tr>
                <tr>
                  <td className="font-bold">Consumed</td>
                  <td className="mono text-right">{fmt2(consumedLbs / 100)}</td>
                  <td className="mono text-right">{fmt2(consumedLbs)}</td>
                  <td className="mono text-right">{fmt2(seedRate)}</td>
                  <td className="mono text-right">{fmt(consumedLbs * seedRate)}</td>
                </tr>
                <tr style={{ fontWeight: 700, borderTop: "2px solid black" }}>
                  <td>Balance</td>
                  <td className="mono text-right">{fmt2(balLbs / 100)}</td>
                  <td className="mono text-right">{fmt2(balLbs)}</td>
                  <td className="mono text-right">{fmt2(seedRate)}</td>
                  <td className="mono text-right">{fmt(balLbs * seedRate)}</td>
                </tr>
              </tbody>
            </table>
            <div className="px-3 py-1.5 text-center font-bold text-[13px]" style={{ background: "#67e8f9" }}>{party}</div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
