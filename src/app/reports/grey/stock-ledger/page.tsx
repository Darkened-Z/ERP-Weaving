import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, sql } from "drizzle-orm";
import { fmt, fmt2, escLike, sixMonthsAgo, todayIso, partyByNameOptions, greyQualityOptions } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GREY STOCK report — quality-wise IN / OUT / Balance (than + meter) + amount.
 *   IN  = grey purchased into the godown (ext_godown_stock)
 *   OUT = sold via Packi Parchi (+ grey transfers / despatches)
 *   Balance = IN − OUT (over the chosen date range)
 *   Amount  = Balance meters × the weighted-avg purchase rate for that quality
 * Filter by date and (optionally) quality / party. Matches the Oracle GREY STOCK screen.
 */
type Bucket = {
  quality: string;
  inThan: number;
  inMtr: number;
  inAmt: number; // Σ(godown net-meter × purchase rate) — used for the avg rate
  outThan: number;
  outMtr: number;
};

export default async function GreyStockReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; quality?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const quality = p.quality?.trim() ?? "";

  const [partyOpts, qualityOpts] = await Promise.all([partyByNameOptions(), greyQualityOptions()]);
  const greys = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction);
  const greyDescByCode = new Map(greys.map((g) => [g.code, g.description]));

  const partyLike = party ? `%${escLike(party)}%` : null;
  const qualityLike = quality ? `%${escLike(quality)}%` : null;

  // IN — godown purchases (with rate, for the amount).
  const gConds = [];
  if (partyLike) gConds.push(sql`${schema.extGodownStock.purchaseParty} LIKE ${partyLike} ESCAPE '\\'`);
  if (qualityLike) gConds.push(sql`${schema.extGodownStock.dspQuality} LIKE ${qualityLike} ESCAPE '\\'`);
  const godownRows = await db
    .select({
      quality: schema.extGodownStock.dspQuality,
      vDate: schema.extGodownStock.vDate,
      than: sql<number>`coalesce(${schema.extGodownStock.than}, 0)`,
      meter: sql<number>`coalesce(${schema.extGodownStock.netMeter}, ${schema.extGodownStock.meter}, 0)`,
      rate: sql<number>`coalesce(${schema.extGodownStock.rate}, 0)`,
    })
    .from(schema.extGodownStock)
    .where(gConds.length ? and(...gConds) : undefined);

  // OUT — packi sales (quality only; the stock sits in one godown).
  const pConds = [];
  if (qualityLike) pConds.push(sql`${schema.extPackiParchi.quality} LIKE ${qualityLike} ESCAPE '\\'`);
  const packiRows = await db
    .select({
      quality: schema.extPackiParchi.quality,
      vDate: schema.extPackiParchi.vDate,
      than: sql<number>`coalesce(${schema.extPackiParchi.than}, 0)`,
      meter: sql<number>`coalesce(${schema.extPackiParchi.meterNet}, 0)`,
    })
    .from(schema.extPackiParchi)
    .where(pConds.length ? and(...pConds) : undefined);

  // OUT — grey transfers.
  const gtConds = [];
  if (qualityLike) gtConds.push(sql`${schema.extGreyTransfer.qualityFrom} LIKE ${qualityLike} ESCAPE '\\'`);
  const gtRows = await db
    .select({
      quality: schema.extGreyTransfer.qualityFrom,
      vDate: schema.extGreyTransfer.vDate,
      than: sql<number>`coalesce(${schema.extGreyTransfer.than}, 0)`,
      meter: sql<number>`coalesce(${schema.extGreyTransfer.meters}, 0)`,
    })
    .from(schema.extGreyTransfer)
    .where(gtConds.length ? and(...gtConds) : undefined);

  // OUT — grey despatches.
  const gdConds = [];
  if (qualityLike) gdConds.push(sql`${schema.intGreyDespatch.greyCode} LIKE ${qualityLike} ESCAPE '\\'`);
  const gdRows = await db
    .select({
      quality: schema.intGreyDespatch.greyCode,
      vDate: schema.intGreyDespatch.vDate,
      than: sql<number>`coalesce(${schema.intGreyDespatch.thanQty}, 0)`,
      meter: sql<number>`coalesce(${schema.intGreyDespatch.lbMtr}, 0)`,
    })
    .from(schema.intGreyDespatch)
    .where(gdConds.length ? and(...gdConds) : undefined);

  const inRange = (d: string) => !!d && d >= from && d <= to;
  const map = new Map<string, Bucket>();
  const bucketFor = (q: string | null) => {
    const key = q ?? "—";
    let b = map.get(key);
    if (!b) { b = { quality: key, inThan: 0, inMtr: 0, inAmt: 0, outThan: 0, outMtr: 0 }; map.set(key, b); }
    return b;
  };

  for (const r of godownRows) {
    if (!inRange(r.vDate)) continue;
    const b = bucketFor(r.quality);
    b.inThan += r.than; b.inMtr += r.meter; b.inAmt += r.meter * r.rate;
  }
  for (const rows of [packiRows, gtRows, gdRows]) {
    for (const r of rows) {
      if (!inRange(r.vDate)) continue;
      const b = bucketFor(r.quality);
      b.outThan += r.than; b.outMtr += r.meter;
    }
  }

  const rows = Array.from(map.values())
    .map((b) => {
      const balThan = b.inThan - b.outThan;
      const balMtr = Math.round((b.inMtr - b.outMtr) * 100) / 100;
      const avgRate = b.inMtr > 0 ? b.inAmt / b.inMtr : 0;
      return { ...b, balThan, balMtr, avgRate, amount: Math.round(balMtr * avgRate) };
    })
    .filter((b) => b.inThan || b.inMtr || b.outThan || b.outMtr)
    .sort((a, b) => a.quality.localeCompare(b.quality));

  const t = rows.reduce(
    (a, r) => ({
      inThan: a.inThan + r.inThan, inMtr: a.inMtr + r.inMtr,
      outThan: a.outThan + r.outThan, outMtr: a.outMtr + r.outMtr,
      balThan: a.balThan + r.balThan, balMtr: a.balMtr + r.balMtr,
      amount: a.amount + r.amount,
    }),
    { inThan: 0, inMtr: 0, outThan: 0, outMtr: 0, balThan: 0, balMtr: 0, amount: 0 },
  );

  return (
    <Shell active="rpt-grey-stock-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">GREY STOCK</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} quialit{rows.length === 1 ? "y" : "ies"} &middot; {from} to {to} &middot; IN − OUT = Balance
            </p>
          </div>
          <div className="flex gap-2">
            <a href={`/reports/grey/stock-account-ledger?from=${from}&to=${to}${party ? `&party=${encodeURIComponent(party)}` : ""}`} className="btn btn-outline btn-sm no-print">
              Value Ledger (Dr/Cr)
            </a>
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                quality: r.quality, inThan: r.inThan, inMtr: Math.round(r.inMtr),
                outThan: r.outThan, outMtr: Math.round(r.outMtr),
                balThan: r.balThan, balMtr: Math.round(r.balMtr), amount: r.amount,
              }))}
              columns={[
                { key: "quality", label: "Quality" },
                { key: "inThan", label: "IN Than" }, { key: "inMtr", label: "IN Mtr" },
                { key: "outThan", label: "OUT Than" }, { key: "outMtr", label: "OUT Mtr" },
                { key: "balThan", label: "Bal Than" }, { key: "balMtr", label: "Bal Mtr" },
                { key: "amount", label: "Amount" },
              ]}
              filename="grey-stock"
              sheetName="GreyStock"
            />
          </div>
        </div>

        <div className="hidden print:block mb-4 text-center">
          <h1 className="page-title">GREY STOCK</h1>
          <div className="mono text-[12px] mt-1">{from} — {to}</div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Quality</label>
            <Combobox name="quality" options={qualityOpts} defaultValue={quality} placeholder="All qualities" />
          </div>
          <div>
            <label className="label block mb-1">Party <span className="text-[9px] text-[var(--muted)]">(supplier — narrows IN)</span></label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/grey/stock-ledger" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th rowSpan={2}>Quality</th>
                <th className="text-right" colSpan={2}>IN</th>
                <th className="text-right" colSpan={2}>OUT</th>
                <th className="text-right" colSpan={2}>Balance</th>
                <th className="text-right" rowSpan={2}>Amount</th>
              </tr>
              <tr>
                <th className="text-right">Than</th><th className="text-right">Mtr</th>
                <th className="text-right">Than</th><th className="text-right">Mtr</th>
                <th className="text-right">Than</th><th className="text-right">Mtr</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-[var(--muted)] py-8">No stock movement for selected filters</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-[13px]">
                      {r.quality}
                      {greyDescByCode.get(r.quality) ? <div className="text-[11px] text-[var(--muted)]">{greyDescByCode.get(r.quality)}</div> : null}
                    </td>
                    <td className="mono text-right">{fmt(r.inThan)}</td>
                    <td className="mono text-right">{fmt2(r.inMtr)}</td>
                    <td className="mono text-right">{fmt(r.outThan)}</td>
                    <td className="mono text-right">{fmt2(r.outMtr)}</td>
                    <td className="mono text-right font-bold">{fmt(r.balThan)}</td>
                    <td className="mono text-right font-bold">{fmt2(r.balMtr)}</td>
                    <td className="mono text-right">{fmt(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td>Total</td>
                  <td className="mono text-right">{fmt(t.inThan)}</td>
                  <td className="mono text-right">{fmt2(t.inMtr)}</td>
                  <td className="mono text-right">{fmt(t.outThan)}</td>
                  <td className="mono text-right">{fmt2(t.outMtr)}</td>
                  <td className="mono text-right">{fmt(t.balThan)}</td>
                  <td className="mono text-right">{fmt2(t.balMtr)}</td>
                  <td className="mono text-right">{fmt(t.amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
