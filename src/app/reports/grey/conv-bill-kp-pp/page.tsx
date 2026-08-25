import { Fragment } from "react";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { fmt, fmt2, sixMonthsAgo, todayIso } from "../../_shared";

export const dynamic = "force-dynamic";

export default async function GreyConvBillKpPpPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();

  const contracts = await db
    .select()
    .from(schema.intGreyConversionContract)
    .orderBy(
      schema.intGreyConversionContract.party,
      schema.intGreyConversionContract.contNo,
    );

  const contNos = contracts.map((c) => c.contNo);
  if (contNos.length === 0) {
    return (
      <Shell active="rpt-grey-conv-bill-kp-pp">
        <div className="animate-in">
          <h1 className="page-title">Grey Conversion Bill (KP/PP)</h1>
          <p className="text-[13px] text-[var(--muted)] mt-6">No grey conversion contracts found.</p>
        </div>
      </Shell>
    );
  }

  const inContNo = sql.join(
    contNos.map((c) => sql`${c}`),
    sql`, `,
  );

  // Produced qty (via beams.contractNo → intDailyProductionSet)
  const produced = await db
    .select({
      contNo: schema.beams.contractNo,
      producedQty: sql<number>`coalesce(sum(${schema.intDailyProductionSet.totalCount}), 0)`,
      rows: sql<number>`count(${schema.intDailyProductionSet.id})`,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id),
    )
    .innerJoin(
      schema.beams,
      eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo),
    )
    .where(
      and(
        gte(schema.intDailyProduction.vDate, from),
        lte(schema.intDailyProduction.vDate, to),
        sql`${schema.beams.contractNo} IN (${inContNo})`,
      ),
    )
    .groupBy(schema.beams.contractNo);
  const producedMap = new Map(produced.map((p) => [p.contNo ?? "", p]));

  // KP total by contract
  const kpAgg = await db
    .select({
      contNo: schema.extKachiParchi.contNo,
      kpMtr: sql<number>`coalesce(sum(${schema.extKachiParchi.meter}), 0)`,
      kpCount: sql<number>`count(*)`,
    })
    .from(schema.extKachiParchi)
    .where(
      and(
        gte(schema.extKachiParchi.vDate, from),
        lte(schema.extKachiParchi.vDate, to),
        sql`${schema.extKachiParchi.contNo} IN (${inContNo})`,
      ),
    )
    .groupBy(schema.extKachiParchi.contNo);
  const kpMap = new Map(kpAgg.map((k) => [k.contNo ?? "", k]));

  // PP total + commission by contract
  const ppAgg = await db
    .select({
      contNo: schema.extPackiParchi.convContNo,
      ppMtr: sql<number>`coalesce(sum(${schema.extPackiParchi.meterNet}), 0)`,
      commission: sql<number>`coalesce(sum(${schema.extPackiParchi.commissionTotal}), 0)`,
      ppCount: sql<number>`count(*)`,
    })
    .from(schema.extPackiParchi)
    .where(
      and(
        gte(schema.extPackiParchi.vDate, from),
        lte(schema.extPackiParchi.vDate, to),
        sql`${schema.extPackiParchi.convContNo} IN (${inContNo})`,
      ),
    )
    .groupBy(schema.extPackiParchi.convContNo);
  const ppMap = new Map(ppAgg.map((p) => [p.contNo ?? "", p]));

  const rows = contracts
    .map((c) => {
      const prod = producedMap.get(c.contNo);
      const kp = kpMap.get(c.contNo);
      const pp = ppMap.get(c.contNo);
      const producedQty = prod?.producedQty ?? 0;
      const kpTotal = kp?.kpMtr ?? 0;
      const ppTotal = pp?.ppMtr ?? 0;
      const commission = pp?.commission ?? 0;
      const rate = c.grayRatePerMtr ?? 0;
      const netBillable = producedQty * rate - commission;
      return {
        party: c.party ?? "",
        contNo: c.contNo,
        contDate: c.contDate,
        contQty: c.qtyMtr ?? 0,
        producedQty,
        kpTotal,
        ppTotal,
        rate,
        commission,
        netBillable,
      };
    })
    .filter(
      (r) => r.producedQty > 0 || r.kpTotal > 0 || r.ppTotal > 0 || r.commission > 0,
    );

  const totContQty = rows.reduce((s, r) => s + r.contQty, 0);
  const totProd = rows.reduce((s, r) => s + r.producedQty, 0);
  const totKp = rows.reduce((s, r) => s + r.kpTotal, 0);
  const totPp = rows.reduce((s, r) => s + r.ppTotal, 0);
  const totComm = rows.reduce((s, r) => s + r.commission, 0);
  const totNet = rows.reduce((s, r) => s + r.netBillable, 0);

  // group by party for display
  const byParty = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byParty.get(r.party) ?? [];
    arr.push(r);
    byParty.set(r.party, arr);
  }
  const parties = [...byParty.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const excelRows = rows.map((r) => ({
    party: r.party,
    contNo: r.contNo,
    contDate: r.contDate,
    contQty: r.contQty,
    producedQty: Math.round(r.producedQty),
    kpTotal: Math.round(r.kpTotal),
    ppTotal: Math.round(r.ppTotal),
    rate: r.rate,
    commission: Math.round(r.commission),
    netBillable: Math.round(r.netBillable),
  }));

  return (
    <Shell active="rpt-grey-conv-bill-kp-pp">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Grey Conversion Bill (KP/PP)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} contracts &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "party", label: "Party" },
                { key: "contNo", label: "Contract No" },
                { key: "contDate", label: "Contract Date" },
                { key: "contQty", label: "Contract Qty" },
                { key: "producedQty", label: "Produced" },
                { key: "kpTotal", label: "KP Total" },
                { key: "ppTotal", label: "PP Total" },
                { key: "rate", label: "Rate/Mtr" },
                { key: "commission", label: "Commission" },
                { key: "netBillable", label: "Net Billable" },
              ]}
              filename="grey-conv-bill-kp-pp"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Grey Conversion Bill (KP/PP)</h1>
          <div className="mono text-[12px] mt-2">
            {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/grey/conv-bill-kp-pp" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totProd)}</div>
            <div className="stat-label">Produced Mtr</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totKp)}</div>
            <div className="stat-label">KP Total</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totPp)}</div>
            <div className="stat-label">PP Total</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totComm)}</div>
            <div className="stat-label">Commission</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totNet)}</div>
            <div className="stat-label">Net Billable</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Contract No</th>
                <th>Date</th>
                <th className="text-right">Cont Qty</th>
                <th className="text-right">Produced</th>
                <th className="text-right">KP Total</th>
                <th className="text-right">PP Total</th>
                <th className="text-right">Rate/Mtr</th>
                <th className="text-right">Commission</th>
                <th className="text-right">Net Billable</th>
              </tr>
            </thead>
            <tbody>
              {parties.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--muted)] py-8">
                    No matching contracts
                  </td>
                </tr>
              ) : (
                parties.map(([party, prows]) => {
                  const pSubTotProd = prows.reduce((s, r) => s + r.producedQty, 0);
                  const pSubKp = prows.reduce((s, r) => s + r.kpTotal, 0);
                  const pSubPp = prows.reduce((s, r) => s + r.ppTotal, 0);
                  const pSubComm = prows.reduce((s, r) => s + r.commission, 0);
                  const pSubNet = prows.reduce((s, r) => s + r.netBillable, 0);
                  return (
                    <Fragment key={party}>
                      <tr style={{ background: "#f4f4f4" }}>
                        <td colSpan={9} className="font-bold">
                          {party || "(No party)"}
                        </td>
                      </tr>
                      {prows.map((r) => (
                        <tr key={r.contNo}>
                          <td className="mono font-bold">{r.contNo}</td>
                          <td className="mono">{r.contDate}</td>
                          <td className="mono text-right">{fmt(r.contQty)}</td>
                          <td className="mono text-right">{fmt(r.producedQty)}</td>
                          <td className="mono text-right">{fmt(r.kpTotal)}</td>
                          <td className="mono text-right">{fmt(r.ppTotal)}</td>
                          <td className="mono text-right">{fmt2(r.rate)}</td>
                          <td className="mono text-right">{fmt(r.commission)}</td>
                          <td className="mono text-right">{fmt(r.netBillable)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700, borderTop: "1px solid black" }}>
                        <td colSpan={3}>Subtotal</td>
                        <td className="mono text-right">{fmt(pSubTotProd)}</td>
                        <td className="mono text-right">{fmt(pSubKp)}</td>
                        <td className="mono text-right">{fmt(pSubPp)}</td>
                        <td></td>
                        <td className="mono text-right">{fmt(pSubComm)}</td>
                        <td className="mono text-right">{fmt(pSubNet)}</td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>Total</td>
                  <td className="mono text-right">{fmt(totContQty)}</td>
                  <td className="mono text-right">{fmt(totProd)}</td>
                  <td className="mono text-right">{fmt(totKp)}</td>
                  <td className="mono text-right">{fmt(totPp)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(totComm)}</td>
                  <td className="mono text-right">{fmt(totNet)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
