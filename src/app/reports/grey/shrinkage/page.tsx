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

export default async function GreyShrinkagePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; cont?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const cont = p.cont?.trim() ?? "";

  const partyOpts = await partyByNameOptions();

  const [accounts, greys] = await Promise.all([
    db.select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description }).from(schema.chartOfAccounts),
    db.select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description }).from(schema.greyConstruction),
  ]);
  const partyCodeByName = new Map(accounts.map((a) => [a.description ?? "", a.code]));
  const greyDescByCode = new Map(greys.map((g) => [g.code, g.description]));

  const conds = [
    gte(schema.intDailyProduction.vDate, from),
    lte(schema.intDailyProduction.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conds.push(sql`(${schema.intDailyProduction.convContParty} LIKE ${pat} ESCAPE '\\' OR ${schema.intDailyProduction.beamContParty} LIKE ${pat} ESCAPE '\\' OR ${schema.intDailyProduction.szgParty} LIKE ${pat} ESCAPE '\\')`);
  }

  const setRows = await db
    .select({
      id: schema.intDailyProductionSet.id,
      vNo: schema.intDailyProduction.vNo,
      vDate: schema.intDailyProduction.vDate,
      convParty: schema.intDailyProduction.convContParty,
      beamParty: schema.intDailyProduction.beamContParty,
      szgParty: schema.intDailyProduction.szgParty,
      setNo: schema.intDailyProduction.setNo,
      lotNo: schema.intDailyProduction.lotNo,
      quality: schema.intDailyProduction.productQuality,
      beamSetNo: schema.intDailyProductionSet.beamSetNo,
      beamNo: schema.intDailyProductionSet.beamNo,
      ends: schema.intDailyProductionSet.ends,
      bLength: schema.intDailyProductionSet.bLength,
      rcvdMtr: schema.intDailyProductionSet.rcvdMtr,
      diff: schema.intDailyProductionSet.diff,
      shrinkage: schema.intDailyProductionSet.shrinkage,
      totalCount: schema.intDailyProductionSet.totalCount,
      rejCount: schema.intDailyProductionSet.rejCount,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      sql`${schema.intDailyProductionSet.productionId} = ${schema.intDailyProduction.id}`
    )
    .where(and(...conds))
    .orderBy(schema.intDailyProduction.vDate);

  const rows = setRows
    .filter((r) => (cont ? (r.setNo ?? "").includes(cont) || (r.lotNo ?? "").includes(cont) || (r.beamSetNo ?? "").includes(cont) : true))
    .map((r) => {
      const bl = r.bLength ?? 0;
      const rcvd = r.rcvdMtr ?? ((r.totalCount ?? 0) + (r.rejCount ?? 0));
      const diff = r.diff != null ? r.diff : bl - rcvd;
      const shrink = r.shrinkage != null ? r.shrinkage : bl > 0 ? (diff / bl) * 100 : 0;
      return { ...r, rcvdMtr: rcvd, diff, shrinkage: shrink };
    });

  const totBl = rows.reduce((s, r) => s + (r.bLength ?? 0), 0);
  const totRcvd = rows.reduce((s, r) => s + (r.rcvdMtr ?? 0), 0);
  const totDiff = totBl - totRcvd;
  const avgShrink = totBl > 0 ? (totDiff / totBl) * 100 : 0;

  return (
    <Shell active="rpt-grey-shrinkage">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Grey Shrinkage Report</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} beams · {from} to {to} · avg shrinkage <span className="mono">{fmt2(avgShrink)}%</span>
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                vDate: r.vDate,
                vNo: r.vNo,
                setNo: r.setNo ?? "",
                lotNo: r.lotNo ?? "",
                beamNo: r.beamNo ?? "",
                beamSetNo: r.beamSetNo ?? "",
                quality: r.quality ?? "",
                convParty: r.convParty ?? "",
                bLength: r.bLength ?? 0,
                rcvdMtr: r.rcvdMtr ?? 0,
                diff: r.diff ?? 0,
                shrinkage: Number(r.shrinkage?.toFixed(2) ?? 0),
              }))}
              columns={[
                { key: "vDate", label: "Date" },
                { key: "vNo", label: "V.No" },
                { key: "setNo", label: "Set" },
                { key: "lotNo", label: "Lot" },
                { key: "beamNo", label: "Beam" },
                { key: "beamSetNo", label: "Beam Set" },
                { key: "quality", label: "Quality" },
                { key: "convParty", label: "Conv Party" },
                { key: "bLength", label: "Beam Length" },
                { key: "rcvdMtr", label: "Rcvd Mtr" },
                { key: "diff", label: "Diff" },
                { key: "shrinkage", label: "Shrinkage %" },
              ]}
              filename="grey-shrinkage"
              sheetName="Shrinkage"
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
            <label className="label block mb-1">Set / Lot / Beam</label>
            <input type="text" name="cont" defaultValue={cont} className="input-box mono" placeholder="Filter by set/lot/beam" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/grey/shrinkage" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>V.No</th>
                <th>Set</th>
                <th>Lot</th>
                <th>Beam</th>
                <th>Quality</th>
                <th>Conv Party</th>
                <th className="text-right">Beam Length</th>
                <th className="text-right">Rcvd Mtr</th>
                <th className="text-right">Diff</th>
                <th className="text-right">Shrink %</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--muted)] py-8">
                    No beams in selected window
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const bad = (r.shrinkage ?? 0) > 5;
                  return (
                    <tr key={r.id}>
                      <td className="mono text-[13px]">{r.vDate}</td>
                      <td className="mono text-[13px] font-bold">{r.vNo}</td>
                      <td className="mono text-[13px]">{r.setNo ?? "-"}</td>
                      <td className="mono text-[13px]">{r.lotNo ?? "-"}</td>
                      <td className="mono text-[13px]">{r.beamNo ?? r.beamSetNo ?? "-"}</td>
                      <td className="text-[13px]">
                        {r.quality ?? "-"}
                        {r.quality && greyDescByCode.get(r.quality) ? (
                          <div className="text-[11px] text-[var(--muted)]">{greyDescByCode.get(r.quality)}</div>
                        ) : null}
                      </td>
                      <td className="text-[13px]">{(() => {
                        const name = r.convParty ?? r.beamParty ?? r.szgParty;
                        if (!name) return "-";
                        const code = partyCodeByName.get(name);
                        return code ? `${name} (${code})` : name;
                      })()}</td>
                      <td className="mono text-right">{fmt2(r.bLength)}</td>
                      <td className="mono text-right">{fmt2(r.rcvdMtr)}</td>
                      <td className="mono text-right">{fmt2(r.diff)}</td>
                      <td className={`mono text-right ${bad ? "italic underline" : "font-bold"}`}>{fmt2(r.shrinkage)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={7}>Total / Avg</td>
                  <td className="mono text-right">{fmt2(totBl)}</td>
                  <td className="mono text-right">{fmt2(totRcvd)}</td>
                  <td className="mono text-right">{fmt2(totDiff)}</td>
                  <td className="mono text-right">{fmt2(avgShrink)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
