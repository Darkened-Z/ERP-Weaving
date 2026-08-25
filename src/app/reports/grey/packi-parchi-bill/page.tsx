import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import {
  fmt,
  fmt2,
  escLike,
  sixMonthsAgo,
  todayIso,
  partyByNameOptions,
} from "../../_shared";

export const dynamic = "force-dynamic";

export default async function PackiParchiBillPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";

  const partyOpts = await partyByNameOptions();

  const conds = [
    gte(schema.extPackiParchi.vDate, from),
    lte(schema.extPackiParchi.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conds.push(
      sql`(${schema.extPackiParchi.purchaseParty} LIKE ${pat} ESCAPE '\\' OR ${schema.extPackiParchi.saleParty} LIKE ${pat} ESCAPE '\\')`,
    );
  }

  const rows = await db
    .select()
    .from(schema.extPackiParchi)
    .where(and(...conds))
    .orderBy(schema.extPackiParchi.vDate, schema.extPackiParchi.vNo);

  const enriched = rows.map((r) => {
    const meter = r.meterNet ?? 0;
    const rateKp = r.greyRateKp ?? r.greyRate ?? 0;
    const greyAmtSal = meter * rateKp;
    const commissionTotal = r.commissionTotal ?? 0;
    const net = greyAmtSal - commissionTotal;
    return { ...r, greyAmtSal, commissionTotal, net };
  });

  const totMtr = enriched.reduce((s, r) => s + (r.meterNet ?? 0), 0);
  const totSal = enriched.reduce((s, r) => s + r.greyAmtSal, 0);
  const totComm = enriched.reduce((s, r) => s + r.commissionTotal, 0);
  const totNet = enriched.reduce((s, r) => s + r.net, 0);

  const excelRows = enriched.map((r) => ({
    vNo: r.vNo,
    vDate: r.vDate,
    ppNo: r.ppNo ?? "",
    purchaseParty: r.purchaseParty ?? "",
    saleParty: r.saleParty ?? "",
    quality: r.quality ?? "",
    meterNet: r.meterNet ?? 0,
    greyRateKp: r.greyRateKp ?? r.greyRate ?? 0,
    greyAmtSal: Math.round(r.greyAmtSal),
    commissionTotal: Math.round(r.commissionTotal),
    net: Math.round(r.net),
  }));

  return (
    <Shell active="rpt-grey-packi-parchi-bill">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Packi Parchi Bill / Register</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {enriched.length} parchis &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "vNo", label: "V.No" },
                { key: "vDate", label: "V.Date" },
                { key: "ppNo", label: "PP No" },
                { key: "purchaseParty", label: "Purchase Party" },
                { key: "saleParty", label: "Sale Party" },
                { key: "quality", label: "Quality" },
                { key: "meterNet", label: "Meter Net" },
                { key: "greyRateKp", label: "Rate" },
                { key: "greyAmtSal", label: "Grey Amt Sal" },
                { key: "commissionTotal", label: "Commission" },
                { key: "net", label: "Net Amount" },
              ]}
              filename="packi-parchi-bill"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Packi Parchi Bill / Register</h1>
          <div className="mono text-[12px] mt-2">
            {from} to {to}
            {party ? ` · ${party}` : ""}
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
          <div className="sm:col-span-2">
            <label className="label block mb-1">Party (purchase or sale)</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/grey/packi-parchi-bill" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totMtr)}</div>
            <div className="stat-label">Meter Net</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totSal)}</div>
            <div className="stat-label">Grey Amt Sal</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totComm)}</div>
            <div className="stat-label">Commission</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totNet)}</div>
            <div className="stat-label">Net Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>V.No</th>
                <th>Date</th>
                <th>PP No</th>
                <th>Purchase Party</th>
                <th>Sale Party</th>
                <th>Quality</th>
                <th className="text-right">Meter</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Sal Amt</th>
                <th className="text-right">Commission</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--muted)] py-8">
                    No packi parchi records for filters
                  </td>
                </tr>
              ) : (
                enriched.map((r) => (
                  <tr key={r.id}>
                    <td className="mono font-bold">{r.vNo}</td>
                    <td className="mono">{r.vDate}</td>
                    <td className="mono">{r.ppNo ?? "-"}</td>
                    <td>{r.purchaseParty ?? "-"}</td>
                    <td>{r.saleParty ?? "-"}</td>
                    <td>{r.quality ?? "-"}</td>
                    <td className="mono text-right">{fmt2(r.meterNet ?? 0)}</td>
                    <td className="mono text-right">{fmt2(r.greyRateKp ?? r.greyRate ?? 0)}</td>
                    <td className="mono text-right">{fmt(r.greyAmtSal)}</td>
                    <td className="mono text-right">{fmt(r.commissionTotal)}</td>
                    <td className={`mono text-right ${r.net < 0 ? "italic underline" : "font-bold"}`}>
                      {fmt(r.net)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {enriched.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={6}>Total</td>
                  <td className="mono text-right">{fmt2(totMtr)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(totSal)}</td>
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
