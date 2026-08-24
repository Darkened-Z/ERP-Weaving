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

export default async function GreyDespatchDetailSrNoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; srno?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const srno = p.srno?.trim() ?? "";

  const partyOpts = await partyByNameOptions();

  const conds = [
    gte(schema.intGreyDespatch.vDate, from),
    lte(schema.intGreyDespatch.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conds.push(sql`(${schema.intGreyDespatch.party} LIKE ${pat} ESCAPE '\\' OR ${schema.intGreyDespatch.doParty} LIKE ${pat} ESCAPE '\\')`);
  }

  const rows = await db
    .select({
      lineId: schema.intGreyDespatchLine.id,
      lineSrNo: schema.intGreyDespatchLine.srNo,
      tSrNo: schema.intGreyDespatchLine.tSrNo,
      a: schema.intGreyDespatchLine.a,
      b: schema.intGreyDespatchLine.b,
      c: schema.intGreyDespatchLine.c,
      cp: schema.intGreyDespatchLine.cp,
      rej: schema.intGreyDespatchLine.rej,
      lengthMtrs: schema.intGreyDespatchLine.lengthMtrs,
      vNo: schema.intGreyDespatch.vNo,
      vDate: schema.intGreyDespatch.vDate,
      party: schema.intGreyDespatch.party,
      doParty: schema.intGreyDespatch.doParty,
      quality: schema.intGreyDespatch.greyCode,
    })
    .from(schema.intGreyDespatchLine)
    .innerJoin(
      schema.intGreyDespatch,
      sql`${schema.intGreyDespatchLine.despatchId} = ${schema.intGreyDespatch.id}`
    )
    .where(and(...conds))
    .orderBy(schema.intGreyDespatch.vDate, schema.intGreyDespatchLine.srNo);

  const filtered = srno
    ? rows.filter((r) => String(r.tSrNo ?? "").includes(srno))
    : rows;

  const tSrs = Array.from(new Set(filtered.map((r) => String(r.tSrNo ?? "")).filter(Boolean)));

  const prodSets = tSrs.length
    ? await db
        .select({
          id: schema.intDailyProductionSet.id,
          mmThanSrNo: schema.intDailyProductionSet.mmThanSrNo,
          beamNo: schema.intDailyProductionSet.beamNo,
          beamSetNo: schema.intDailyProductionSet.beamSetNo,
          bLength: schema.intDailyProductionSet.bLength,
          rcvdMtr: schema.intDailyProductionSet.rcvdMtr,
          prodVNo: schema.intDailyProduction.vNo,
          prodVDate: schema.intDailyProduction.vDate,
          prodShed: schema.intDailyProduction.shedNo,
          prodSet: schema.intDailyProduction.setNo,
        })
        .from(schema.intDailyProductionSet)
        .innerJoin(
          schema.intDailyProduction,
          sql`${schema.intDailyProductionSet.productionId} = ${schema.intDailyProduction.id}`
        )
        .where(sql`${schema.intDailyProductionSet.mmThanSrNo} IN (${sql.join(tSrs.map((s) => sql`${s}`), sql`, `)})`)
    : [];

  const prodMap = new Map<string, (typeof prodSets)[number]>();
  for (const s of prodSets) {
    if (s.mmThanSrNo) prodMap.set(s.mmThanSrNo, s);
  }

  const enriched = filtered.map((r) => {
    const src = prodMap.get(String(r.tSrNo ?? ""));
    return {
      ...r,
      srcVNo: src?.prodVNo ?? "-",
      srcVDate: src?.prodVDate ?? "-",
      srcShed: src?.prodShed ?? "-",
      srcSet: src?.prodSet ?? "-",
      srcBeam: src?.beamNo ?? src?.beamSetNo ?? "-",
    };
  });

  const totMtr = enriched.reduce((s, r) => s + (r.lengthMtrs ?? 0), 0);
  const totThan = enriched.length;

  return (
    <Shell active="rpt-grey-despatch-srno">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Despatch Detail by Serial No</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {enriched.length} thans · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={enriched.map((r) => ({
                vNo: r.vNo,
                vDate: r.vDate,
                party: r.party ?? "",
                quality: r.quality ?? "",
                tSrNo: r.tSrNo ?? "",
                a: r.a ?? 0,
                b: r.b ?? 0,
                c: r.c ?? 0,
                cp: r.cp ?? 0,
                rej: r.rej ?? 0,
                lengthMtrs: r.lengthMtrs ?? 0,
                srcVNo: r.srcVNo,
                srcVDate: r.srcVDate,
                srcShed: r.srcShed,
                srcSet: r.srcSet,
                srcBeam: r.srcBeam,
              }))}
              columns={[
                { key: "vNo", label: "Despatch V.No" },
                { key: "vDate", label: "Despatch Date" },
                { key: "party", label: "Party" },
                { key: "quality", label: "Quality" },
                { key: "tSrNo", label: "Than Sr#" },
                { key: "a", label: "A" },
                { key: "b", label: "B" },
                { key: "c", label: "C" },
                { key: "cp", label: "CP" },
                { key: "rej", label: "Rej" },
                { key: "lengthMtrs", label: "Meters" },
                { key: "srcVNo", label: "Source Prod V.No" },
                { key: "srcVDate", label: "Source Date" },
                { key: "srcShed", label: "Shed" },
                { key: "srcSet", label: "Set" },
                { key: "srcBeam", label: "Beam" },
              ]}
              filename="despatch-detail-srno"
              sheetName="DespatchDetail"
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
            <label className="label block mb-1">Than Sr No</label>
            <input type="text" name="srno" defaultValue={srno} className="input-box mono" placeholder="Filter Sr#" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/grey/despatch-detail-srno" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Despatch V.No</th>
                <th>Date</th>
                <th>Party</th>
                <th>Quality</th>
                <th className="text-right">T.Sr#</th>
                <th className="text-right">A</th>
                <th className="text-right">B</th>
                <th className="text-right">C</th>
                <th className="text-right">CP</th>
                <th className="text-right">Rej</th>
                <th className="text-right">Mtrs</th>
                <th>Source V.No</th>
                <th>Src Date</th>
                <th>Shed</th>
                <th>Beam</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={15} className="text-center text-[var(--muted)] py-8">
                    No despatch lines for selected filters
                  </td>
                </tr>
              ) : (
                enriched.map((r) => (
                  <tr key={r.lineId}>
                    <td className="mono text-[13px] font-bold">{r.vNo}</td>
                    <td className="mono text-[13px]">{r.vDate}</td>
                    <td className="text-[13px]">{r.party ?? r.doParty ?? "-"}</td>
                    <td className="text-[13px]">{r.quality ?? "-"}</td>
                    <td className="mono text-right">{r.tSrNo ?? "-"}</td>
                    <td className="mono text-right">{fmt2(r.a ?? 0)}</td>
                    <td className="mono text-right">{fmt2(r.b ?? 0)}</td>
                    <td className="mono text-right">{fmt2(r.c ?? 0)}</td>
                    <td className="mono text-right">{fmt2(r.cp ?? 0)}</td>
                    <td className="mono text-right">{fmt2(r.rej ?? 0)}</td>
                    <td className="mono text-right font-bold">{fmt2(r.lengthMtrs ?? 0)}</td>
                    <td className="mono text-[13px]">{r.srcVNo}</td>
                    <td className="mono text-[13px]">{r.srcVDate}</td>
                    <td className="mono text-[13px]">{r.srcShed}</td>
                    <td className="mono text-[13px]">{r.srcBeam}</td>
                  </tr>
                ))
              )}
            </tbody>
            {enriched.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={10}>{fmt(totThan)} thans</td>
                  <td className="mono text-right">{fmt2(totMtr)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
