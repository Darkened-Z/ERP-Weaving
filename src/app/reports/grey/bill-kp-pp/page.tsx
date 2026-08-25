import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
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

export default async function GreyBillKpPpPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";

  const partyOpts = await partyByNameOptions();

  const accounts = await db.select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description }).from(schema.chartOfAccounts);
  const partyCodeByName = new Map(accounts.map((a) => [a.description ?? "", a.code]));

  const conds = [
    gte(schema.extKachiParchi.vDate, from),
    lte(schema.extKachiParchi.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conds.push(sql`(${schema.extKachiParchi.purchaseParty} LIKE ${pat} ESCAPE '\\' OR ${schema.extKachiParchi.saleParty} LIKE ${pat} ESCAPE '\\')`);
  }

  const rows = await db
    .select({
      id: schema.extKachiParchi.id,
      kpVno: schema.extKachiParchi.vNo,
      kpDate: schema.extKachiParchi.vDate,
      kpNo: schema.extKachiParchi.kpNo,
      purchaseParty: schema.extKachiParchi.purchaseParty,
      saleParty: schema.extKachiParchi.saleParty,
      quality: schema.extKachiParchi.dspQuality,
      than: schema.extKachiParchi.than,
      meter: schema.extKachiParchi.meter,
      ratePur: schema.extKachiParchi.ratePur,
      rateSal: schema.extKachiParchi.rateSal,
      ppVno: schema.extKachiParchi.ppVno,
      ppNo: schema.extPackiParchi.ppNo,
      ppDate: schema.extPackiParchi.ppDate,
      ppMeter: schema.extPackiParchi.meterNet,
      ppGreyRate: schema.extPackiParchi.greyRate,
      ppWoc: schema.extPackiParchi.woc,
    })
    .from(schema.extKachiParchi)
    .leftJoin(
      schema.extPackiParchi,
      sql`${schema.extKachiParchi.ppVno} = ${schema.extPackiParchi.vNo}`
    )
    .where(and(...conds))
    .orderBy(schema.extKachiParchi.vDate);

  const enriched = rows.map((r) => {
    const mtr = r.meter ?? 0;
    const purAmt = mtr * (r.ratePur ?? 0);
    const salAmt = (r.ppMeter ?? mtr) * (r.ppGreyRate ?? r.rateSal ?? 0);
    const pl = salAmt - purAmt;
    return { ...r, purAmt, salAmt, pl };
  });

  const totalPur = enriched.reduce((s, r) => s + r.purAmt, 0);
  const totalSal = enriched.reduce((s, r) => s + r.salAmt, 0);
  const totalPl = totalSal - totalPur;
  const totMtr = enriched.reduce((s, r) => s + (r.meter ?? 0), 0);

  return (
    <Shell active="rpt-grey-bill-kp-pp">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Grey Bill KP-PP</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {enriched.length} bills · {from} to {to} · P/L <span className={`mono ${totalPl < 0 ? "italic underline" : "font-bold"}`}>{fmt(totalPl)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={enriched.map((r) => ({
                kpVno: r.kpVno,
                kpDate: r.kpDate,
                kpNo: r.kpNo ?? "",
                purchaseParty: r.purchaseParty ?? "",
                saleParty: r.saleParty ?? "",
                quality: r.quality ?? "",
                than: r.than ?? 0,
                meter: Math.round(r.meter ?? 0),
                ratePur: r.ratePur ?? 0,
                purAmt: Math.round(r.purAmt),
                ppVno: r.ppVno ?? "",
                ppNo: r.ppNo ?? "",
                ppDate: r.ppDate ?? "",
                salAmt: Math.round(r.salAmt),
                pl: Math.round(r.pl),
              }))}
              columns={[
                { key: "kpVno", label: "KP V.No" },
                { key: "kpDate", label: "KP Date" },
                { key: "kpNo", label: "KP No" },
                { key: "purchaseParty", label: "Purchase Party" },
                { key: "saleParty", label: "Sale Party" },
                { key: "quality", label: "Quality" },
                { key: "than", label: "Than" },
                { key: "meter", label: "Meter" },
                { key: "ratePur", label: "Pur Rate" },
                { key: "purAmt", label: "Pur Amt" },
                { key: "ppVno", label: "PP V.No" },
                { key: "ppNo", label: "PP No" },
                { key: "ppDate", label: "PP Date" },
                { key: "salAmt", label: "Sale Amt" },
                { key: "pl", label: "P/L" },
              ]}
              filename="grey-bill-kp-pp"
              sheetName="KP-PP"
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
          <div className="sm:col-span-2">
            <label className="label block mb-1">Party (purchase or sale)</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/grey/bill-kp-pp" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>KP V.No</th>
                <th>KP Date</th>
                <th>KP No</th>
                <th>Purchase Party</th>
                <th>Sale Party</th>
                <th>Quality</th>
                <th className="text-right">Than</th>
                <th className="text-right">Meter</th>
                <th className="text-right">Pur Rate</th>
                <th className="text-right">Pur Amt</th>
                <th>PP No</th>
                <th>PP Date</th>
                <th className="text-right">Sale Amt</th>
                <th className="text-right">P/L</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center text-[var(--muted)] py-8">
                    No KP records for selected filters
                  </td>
                </tr>
              ) : (
                enriched.map((r) => (
                  <tr key={r.id}>
                    <td className="mono text-[13px] font-bold">{r.kpVno}</td>
                    <td className="mono text-[13px]">{r.kpDate}</td>
                    <td className="mono text-[13px]">{r.kpNo ?? "-"}</td>
                    <td className="text-[13px]">{r.purchaseParty ? `${r.purchaseParty}${partyCodeByName.get(r.purchaseParty) ? ` (${partyCodeByName.get(r.purchaseParty)})` : ""}` : "-"}</td>
                    <td className="text-[13px]">{r.saleParty ? `${r.saleParty}${partyCodeByName.get(r.saleParty) ? ` (${partyCodeByName.get(r.saleParty)})` : ""}` : "-"}</td>
                    <td className="text-[13px]">{r.quality ?? "-"}</td>
                    <td className="mono text-right">{r.than ?? "-"}</td>
                    <td className="mono text-right">{fmt2(r.meter ?? 0)}</td>
                    <td className="mono text-right">{fmt2(r.ratePur ?? 0)}</td>
                    <td className="mono text-right">{fmt(r.purAmt)}</td>
                    <td className="mono text-[13px]">{r.ppNo ?? r.ppVno ?? "-"}</td>
                    <td className="mono text-[13px]">{r.ppDate ?? "-"}</td>
                    <td className="mono text-right">{fmt(r.salAmt)}</td>
                    <td className={`mono text-right ${r.pl < 0 ? "italic underline" : "font-bold"}`}>{fmt(r.pl)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {enriched.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={7}>Total</td>
                  <td className="mono text-right">{fmt2(totMtr)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(totalPur)}</td>
                  <td colSpan={2}></td>
                  <td className="mono text-right">{fmt(totalSal)}</td>
                  <td className={`mono text-right ${totalPl < 0 ? "italic underline" : ""}`}>{fmt(totalPl)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
