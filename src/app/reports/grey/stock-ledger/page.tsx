import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, sql } from "drizzle-orm";
import {
  fmt,
  fmt2,
  escLike,
  sixMonthsAgo,
  todayIso,
  partyByNameOptions,
  greyQualityOptions,
} from "../../_shared";

export const dynamic = "force-dynamic";

type Bucket = {
  party: string;
  quality: string;
  openThan: number;
  openMtr: number;
  rcvThan: number;
  rcvMtr: number;
  issThan: number;
  issMtr: number;
};

export default async function GreyStockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; quality?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const quality = p.quality?.trim() ?? "";

  const [partyOpts, qualityOpts] = await Promise.all([
    partyByNameOptions(),
    greyQualityOptions(),
  ]);

  const partyLike = party ? `%${escLike(party)}%` : null;
  const qualityLike = quality ? `%${escLike(quality)}%` : null;

  const godownConds = [];
  if (partyLike) godownConds.push(sql`${schema.extGodownStock.purchaseParty} LIKE ${partyLike} ESCAPE '\\'`);
  if (qualityLike) godownConds.push(sql`${schema.extGodownStock.dspQuality} LIKE ${qualityLike} ESCAPE '\\'`);

  const kpConds = [];
  if (partyLike) kpConds.push(sql`${schema.extKachiParchi.purchaseParty} LIKE ${partyLike} ESCAPE '\\'`);
  if (qualityLike) kpConds.push(sql`${schema.extKachiParchi.dspQuality} LIKE ${qualityLike} ESCAPE '\\'`);

  const gtConds = [];
  if (partyLike) gtConds.push(sql`${schema.extGreyTransfer.partyFrom} LIKE ${partyLike} ESCAPE '\\'`);
  if (qualityLike) gtConds.push(sql`${schema.extGreyTransfer.qualityFrom} LIKE ${qualityLike} ESCAPE '\\'`);

  const gdConds = [];
  if (partyLike) gdConds.push(sql`${schema.intGreyDespatch.party} LIKE ${partyLike} ESCAPE '\\'`);
  if (qualityLike) gdConds.push(sql`${schema.intGreyDespatch.greyCode} LIKE ${qualityLike} ESCAPE '\\'`);

  const godownRows = await db
    .select({
      party: schema.extGodownStock.purchaseParty,
      quality: schema.extGodownStock.dspQuality,
      vDate: schema.extGodownStock.vDate,
      than: sql<number>`coalesce(${schema.extGodownStock.than}, 0)`,
      meter: sql<number>`coalesce(${schema.extGodownStock.netMeter}, ${schema.extGodownStock.meter}, 0)`,
    })
    .from(schema.extGodownStock)
    .where(godownConds.length ? and(...godownConds) : undefined);

  const kpRows = await db
    .select({
      party: schema.extKachiParchi.purchaseParty,
      quality: schema.extKachiParchi.dspQuality,
      vDate: schema.extKachiParchi.vDate,
      type: schema.extKachiParchi.type,
      than: sql<number>`coalesce(${schema.extKachiParchi.than}, 0)`,
      meter: sql<number>`coalesce(${schema.extKachiParchi.meter}, 0)`,
    })
    .from(schema.extKachiParchi)
    .where(kpConds.length ? and(...kpConds) : undefined);

  const gtRows = await db
    .select({
      party: schema.extGreyTransfer.partyFrom,
      quality: schema.extGreyTransfer.qualityFrom,
      vDate: schema.extGreyTransfer.vDate,
      than: sql<number>`coalesce(${schema.extGreyTransfer.than}, 0)`,
      meter: sql<number>`coalesce(${schema.extGreyTransfer.meters}, 0)`,
    })
    .from(schema.extGreyTransfer)
    .where(gtConds.length ? and(...gtConds) : undefined);

  const gdRows = await db
    .select({
      party: schema.intGreyDespatch.party,
      quality: schema.intGreyDespatch.greyCode,
      vDate: schema.intGreyDespatch.vDate,
      than: sql<number>`coalesce(${schema.intGreyDespatch.thanQty}, 0)`,
      meter: sql<number>`coalesce(${schema.intGreyDespatch.lbMtr}, 0)`,
    })
    .from(schema.intGreyDespatch)
    .where(gdConds.length ? and(...gdConds) : undefined);

  const map = new Map<string, Bucket>();
  const key = (pty: string | null, q: string | null) => `${pty ?? "—"}||${q ?? "—"}`;
  const bucketFor = (pty: string | null, q: string | null) => {
    const k = key(pty, q);
    let b = map.get(k);
    if (!b) {
      b = { party: pty ?? "—", quality: q ?? "—", openThan: 0, openMtr: 0, rcvThan: 0, rcvMtr: 0, issThan: 0, issMtr: 0 };
      map.set(k, b);
    }
    return b;
  };

  const inRange = (d: string) => d >= from && d <= to;
  const before = (d: string) => d < from;

  for (const r of godownRows) {
    const b = bucketFor(r.party, r.quality);
    if (before(r.vDate)) {
      b.openThan += r.than;
      b.openMtr += r.meter;
    } else if (inRange(r.vDate)) {
      b.rcvThan += r.than;
      b.rcvMtr += r.meter;
    }
  }
  for (const r of kpRows) {
    const b = bucketFor(r.party, r.quality);
    const isIssue = r.type === "OUT" || r.type === "SAL" || r.type === "SALE";
    if (before(r.vDate)) {
      if (isIssue) {
        b.openThan -= r.than;
        b.openMtr -= r.meter;
      } else {
        b.openThan += r.than;
        b.openMtr += r.meter;
      }
    } else if (inRange(r.vDate)) {
      if (isIssue) {
        b.issThan += r.than;
        b.issMtr += r.meter;
      } else {
        b.rcvThan += r.than;
        b.rcvMtr += r.meter;
      }
    }
  }
  for (const r of gtRows) {
    const b = bucketFor(r.party, r.quality);
    if (before(r.vDate)) {
      b.openThan -= r.than;
      b.openMtr -= r.meter;
    } else if (inRange(r.vDate)) {
      b.issThan += r.than;
      b.issMtr += r.meter;
    }
  }
  for (const r of gdRows) {
    const b = bucketFor(r.party, r.quality);
    if (before(r.vDate)) {
      b.openThan -= r.than;
      b.openMtr -= r.meter;
    } else if (inRange(r.vDate)) {
      b.issThan += r.than;
      b.issMtr += r.meter;
    }
  }

  const rows = Array.from(map.values())
    .map((b) => ({
      ...b,
      closeThan: b.openThan + b.rcvThan - b.issThan,
      closeMtr: b.openMtr + b.rcvMtr - b.issMtr,
    }))
    .filter((b) => b.openThan || b.openMtr || b.rcvThan || b.rcvMtr || b.issThan || b.issMtr)
    .sort((a, b) => a.party.localeCompare(b.party) || a.quality.localeCompare(b.quality));

  const totals = rows.reduce(
    (t, r) => ({
      openThan: t.openThan + r.openThan,
      openMtr: t.openMtr + r.openMtr,
      rcvThan: t.rcvThan + r.rcvThan,
      rcvMtr: t.rcvMtr + r.rcvMtr,
      issThan: t.issThan + r.issThan,
      issMtr: t.issMtr + r.issMtr,
      closeThan: t.closeThan + r.closeThan,
      closeMtr: t.closeMtr + r.closeMtr,
    }),
    { openThan: 0, openMtr: 0, rcvThan: 0, rcvMtr: 0, issThan: 0, issMtr: 0, closeThan: 0, closeMtr: 0 }
  );

  return (
    <Shell active="rpt-grey-stock-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Grey Stock Ledger</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} party × quality buckets · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                ...r,
                openThan: r.openThan,
                openMtr: Math.round(r.openMtr),
                rcvThan: r.rcvThan,
                rcvMtr: Math.round(r.rcvMtr),
                issThan: r.issThan,
                issMtr: Math.round(r.issMtr),
                closeThan: r.closeThan,
                closeMtr: Math.round(r.closeMtr),
              }))}
              columns={[
                { key: "party", label: "Party" },
                { key: "quality", label: "Quality" },
                { key: "openThan", label: "Open Than" },
                { key: "openMtr", label: "Open Mtr" },
                { key: "rcvThan", label: "Rcv Than" },
                { key: "rcvMtr", label: "Rcv Mtr" },
                { key: "issThan", label: "Iss Than" },
                { key: "issMtr", label: "Iss Mtr" },
                { key: "closeThan", label: "Close Than" },
                { key: "closeMtr", label: "Close Mtr" },
              ]}
              filename="grey-stock-ledger"
              sheetName="StockLedger"
            />
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
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
            <label className="label block mb-1">Quality</label>
            <Combobox name="quality" options={qualityOpts} defaultValue={quality} placeholder="All qualities" />
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
                <th rowSpan={2}>Party</th>
                <th rowSpan={2}>Quality</th>
                <th className="text-right" colSpan={2}>Opening</th>
                <th className="text-right" colSpan={2}>Receipts</th>
                <th className="text-right" colSpan={2}>Issues</th>
                <th className="text-right" colSpan={2}>Closing</th>
              </tr>
              <tr>
                <th className="text-right">Than</th>
                <th className="text-right">Mtr</th>
                <th className="text-right">Than</th>
                <th className="text-right">Mtr</th>
                <th className="text-right">Than</th>
                <th className="text-right">Mtr</th>
                <th className="text-right">Than</th>
                <th className="text-right">Mtr</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
                    No stock movement for selected filters
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-[13px]">{r.party}</td>
                    <td className="text-[13px]">{r.quality}</td>
                    <td className="mono text-right">{fmt(r.openThan)}</td>
                    <td className="mono text-right">{fmt2(r.openMtr)}</td>
                    <td className="mono text-right">{fmt(r.rcvThan)}</td>
                    <td className="mono text-right">{fmt2(r.rcvMtr)}</td>
                    <td className="mono text-right">{fmt(r.issThan)}</td>
                    <td className="mono text-right">{fmt2(r.issMtr)}</td>
                    <td className="mono text-right font-bold">{fmt(r.closeThan)}</td>
                    <td className="mono text-right font-bold">{fmt2(r.closeMtr)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>Total</td>
                  <td className="mono text-right">{fmt(totals.openThan)}</td>
                  <td className="mono text-right">{fmt2(totals.openMtr)}</td>
                  <td className="mono text-right">{fmt(totals.rcvThan)}</td>
                  <td className="mono text-right">{fmt2(totals.rcvMtr)}</td>
                  <td className="mono text-right">{fmt(totals.issThan)}</td>
                  <td className="mono text-right">{fmt2(totals.issMtr)}</td>
                  <td className="mono text-right">{fmt(totals.closeThan)}</td>
                  <td className="mono text-right">{fmt2(totals.closeMtr)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
