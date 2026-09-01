import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, sql } from "drizzle-orm";
import { fmt, fmt2, escLike, sixMonthsAgo, todayIso, partyByNameOptions, greyQualityOptions } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GREY STOCK — DETAIL LEDGER (LOV-3): every movement in date order with a running
 * than + meter balance. Grey purchase = IN, Packi sale = OUT.
 * Columns: Date · V.No · Narration · IN (than, mtr) · OUT (than, mtr) · Balance (than, mtr).
 */
export default async function GreyStockDetailLedgerPage({
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
  const partyLike = party ? `%${escLike(party)}%` : null;
  const qualityLike = quality ? `%${escLike(quality)}%` : null;

  // IN — grey purchases into the godown.
  const gConds = [];
  if (partyLike) gConds.push(sql`${schema.extGodownStock.purchaseParty} LIKE ${partyLike} ESCAPE '\\'`);
  if (qualityLike) gConds.push(sql`${schema.extGodownStock.dspQuality} LIKE ${qualityLike} ESCAPE '\\'`);
  const godownRows = await db
    .select({
      vNo: schema.extGodownStock.vNo,
      vDate: schema.extGodownStock.vDate,
      id: schema.extGodownStock.id,
      quality: schema.extGodownStock.dspQuality,
      than: sql<number>`coalesce(${schema.extGodownStock.than}, 0)`,
      meter: sql<number>`coalesce(${schema.extGodownStock.netMeter}, ${schema.extGodownStock.meter}, 0)`,
      rate: sql<number>`coalesce(${schema.extGodownStock.rate}, 0)`,
    })
    .from(schema.extGodownStock)
    .where(gConds.length ? and(...gConds) : undefined);

  // OUT — sales via packi parchi.
  const pConds = [];
  if (qualityLike) pConds.push(sql`${schema.extPackiParchi.quality} LIKE ${qualityLike} ESCAPE '\\'`);
  const packiRows = await db
    .select({
      vNo: schema.extPackiParchi.vNo,
      vDate: schema.extPackiParchi.vDate,
      id: schema.extPackiParchi.id,
      quality: schema.extPackiParchi.quality,
      than: sql<number>`coalesce(${schema.extPackiParchi.than}, 0)`,
      meter: sql<number>`coalesce(${schema.extPackiParchi.meterNet}, 0)`,
      rate: sql<number>`coalesce(${schema.extPackiParchi.greyRate}, 0)`,
    })
    .from(schema.extPackiParchi)
    .where(pConds.length ? and(...pConds) : undefined);

  const inRange = (d: string) => !!d && d >= from && d <= to;
  type Mv = {
    date: string; vNo: string; id: number; kind: "IN" | "OUT";
    quality: string; than: number; meter: number; rate: number;
  };
  const moves: Mv[] = [
    ...godownRows.filter((r) => inRange(r.vDate)).map((r) => ({
      date: r.vDate ?? "", vNo: r.vNo ?? "", id: r.id, kind: "IN" as const,
      quality: r.quality ?? "", than: r.than, meter: r.meter, rate: r.rate,
    })),
    ...packiRows.filter((r) => inRange(r.vDate)).map((r) => ({
      date: r.vDate ?? "", vNo: r.vNo ?? "", id: r.id, kind: "OUT" as const,
      quality: r.quality ?? "", than: r.than, meter: r.meter, rate: r.rate,
    })),
  ].sort((a, b) => (a.date === b.date ? (a.kind === b.kind ? a.id - b.id : a.kind === "IN" ? -1 : 1) : a.date.localeCompare(b.date)));

  let balThan = 0;
  let balMtr = 0;
  const rows = moves.map((m) => {
    if (m.kind === "IN") { balThan += m.than; balMtr += m.meter; }
    else { balThan -= m.than; balMtr -= m.meter; }
    return {
      ...m,
      narration: `${m.than} THAN ${fmt(m.meter)} MTR @ ${m.rate}${m.quality ? ` , ${m.quality}` : ""} (${m.kind === "IN" ? "GREY PURCHASE" : "PACKI SALE"})`,
      balThan: Math.round(balThan * 100) / 100,
      balMtr: Math.round(balMtr * 100) / 100,
    };
  });

  const t = {
    inThan: moves.filter((m) => m.kind === "IN").reduce((a, m) => a + m.than, 0),
    inMtr: moves.filter((m) => m.kind === "IN").reduce((a, m) => a + m.meter, 0),
    outThan: moves.filter((m) => m.kind === "OUT").reduce((a, m) => a + m.than, 0),
    outMtr: moves.filter((m) => m.kind === "OUT").reduce((a, m) => a + m.meter, 0),
  };

  return (
    <Shell active="rpt-grey-stock-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">GREY STOCK — DETAIL LEDGER</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} movements &middot; {from} to {to} &middot; IN = purchase, OUT = packi sale
            </p>
          </div>
          <div className="flex gap-2">
            <a href={`/reports/grey/stock-ledger?from=${from}&to=${to}${party ? `&party=${encodeURIComponent(party)}` : ""}${quality ? `&quality=${encodeURIComponent(quality)}` : ""}`} className="btn btn-outline btn-sm no-print">
              Stock Summary
            </a>
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                date: r.date, vNo: r.vNo, type: r.kind, quality: r.quality,
                inThan: r.kind === "IN" ? r.than : 0, inMtr: r.kind === "IN" ? Math.round(r.meter) : 0,
                outThan: r.kind === "OUT" ? r.than : 0, outMtr: r.kind === "OUT" ? Math.round(r.meter) : 0,
                balThan: r.balThan, balMtr: Math.round(r.balMtr),
              }))}
              columns={[
                { key: "date", label: "Date" }, { key: "vNo", label: "V.No" }, { key: "type", label: "Type" },
                { key: "quality", label: "Quality" },
                { key: "inThan", label: "IN Than" }, { key: "inMtr", label: "IN Mtr" },
                { key: "outThan", label: "OUT Than" }, { key: "outMtr", label: "OUT Mtr" },
                { key: "balThan", label: "Bal Than" }, { key: "balMtr", label: "Bal Mtr" },
              ]}
              filename="grey-stock-detail"
              sheetName="StockDetail"
            />
          </div>
        </div>

        <div className="hidden print:block mb-4 text-center">
          <h1 className="page-title">GREY STOCK — DETAIL LEDGER</h1>
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
            <label className="label block mb-1">Party <span className="text-[9px] text-[var(--muted)]">(supplier)</span></label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/grey/stock-detail-ledger" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th rowSpan={2}>V.No</th>
                <th rowSpan={2}>Narration</th>
                <th className="text-right" colSpan={2}>IN</th>
                <th className="text-right" colSpan={2}>OUT</th>
                <th className="text-right" colSpan={2}>Balance</th>
              </tr>
              <tr>
                <th className="text-right">Than</th><th className="text-right">Mtr</th>
                <th className="text-right">Than</th><th className="text-right">Mtr</th>
                <th className="text-right">Than</th><th className="text-right">Mtr</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-[var(--muted)] py-8">No movements in this range</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono text-[13px]">{r.date}</td>
                    <td className="mono text-[13px] font-bold">{r.vNo}</td>
                    <td className="text-[12px] text-[var(--muted)]">{r.narration}</td>
                    <td className="mono text-right">{r.kind === "IN" ? fmt(r.than) : ""}</td>
                    <td className="mono text-right">{r.kind === "IN" ? fmt2(r.meter) : ""}</td>
                    <td className="mono text-right">{r.kind === "OUT" ? fmt(r.than) : ""}</td>
                    <td className="mono text-right">{r.kind === "OUT" ? fmt2(r.meter) : ""}</td>
                    <td className="mono text-right font-semibold">{fmt(r.balThan)}</td>
                    <td className="mono text-right font-semibold">{fmt2(r.balMtr)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={3} className="text-right uppercase tracking-[0.05em]">Total</td>
                  <td className="mono text-right">{fmt(t.inThan)}</td>
                  <td className="mono text-right">{fmt2(t.inMtr)}</td>
                  <td className="mono text-right">{fmt(t.outThan)}</td>
                  <td className="mono text-right">{fmt2(t.outMtr)}</td>
                  <td className="mono text-right">{fmt(t.inThan - t.outThan)}</td>
                  <td className="mono text-right">{fmt2(t.inMtr - t.outMtr)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
