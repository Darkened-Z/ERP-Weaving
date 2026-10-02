import React from "react";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, sql, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-PK").format(Math.round(n));

const fmt2 = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default async function RunningSetReportPage() {
  await requireSession();

  const runningSets = await db
    .select()
    .from(schema.intWarpedBeamReceiving)
    .where(eq(schema.intWarpedBeamReceiving.status, "RUNNING"))
    .orderBy(schema.intWarpedBeamReceiving.vNo);

  const setIds = runningSets.map((s) => s.id);
  const allLines = setIds.length
    ? await db
        .select()
        .from(schema.intWarpedBeamReceivingLine)
        .where(inArray(schema.intWarpedBeamReceivingLine.receivingId, setIds))
        .orderBy(schema.intWarpedBeamReceivingLine.id)
    : [];

  const beamNos = [...new Set(allLines.map((l) => l.beamNo).filter(Boolean))] as string[];
  const beamMaster = beamNos.length
    ? await db
        .select({
          beamNo: schema.beams.beamNo,
          statusWrk: schema.beams.statusWrk,
          loomNo: schema.beams.loomNo,
          shed: schema.beams.shed,
          length: schema.beams.length,
          ends: schema.beams.ends,
          knVno: schema.beams.knVno,
          knDate: schema.beams.knDate,
        })
        .from(schema.beams)
        .where(inArray(schema.beams.beamNo, beamNos))
    : [];
  const beamMap = new Map(beamMaster.map((b) => [b.beamNo, b]));

  const setNos = [...new Set(allLines.map((l) => l.setNo).filter(Boolean))] as string[];
  const allProduction = setNos.length
    ? await db
        .select({
          id: schema.intDailyProduction.id,
          vDate: schema.intDailyProduction.vDate,
          vNo: schema.intDailyProduction.vNo,
          setNo: schema.intDailyProduction.setNo,
          shedNo: schema.intDailyProduction.shedNo,
        })
        .from(schema.intDailyProduction)
        .where(inArray(schema.intDailyProduction.setNo, setNos))
    : [];
  const prodIds = allProduction.map((p) => p.id);
  const allProdSets = prodIds.length
    ? await db
        .select()
        .from(schema.intDailyProductionSet)
        .where(inArray(schema.intDailyProductionSet.productionId, prodIds))
        .orderBy(schema.intDailyProductionSet.srNo)
    : [];
  const allProdDetails = prodIds.length
    ? await db
        .select()
        .from(schema.intDailyProductionDetail)
        .where(inArray(schema.intDailyProductionDetail.productionId, prodIds))
        .orderBy(schema.intDailyProductionDetail.detailDate)
    : [];

  const prodByProdId = new Map<number, typeof allProduction[0]>();
  for (const p of allProduction) prodByProdId.set(p.id, p);

  const accounts = await db
    .select({ code: schema.chartOfAccounts.code, desc: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const nameByCode = new Map(accounts.map((a) => [a.code, a.desc ?? ""]));

  const totalBeams = allLines.length;

  return (
    <Shell active="rpt-w-running-sets">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Running Sets Report</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {runningSets.length} running set{runningSets.length === 1 ? "" : "s"} &middot; {totalBeams} beam{totalBeams === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <PrintButton label="Print" />
          </div>
        </div>

        {runningSets.length === 0 ? (
          <div className="card px-4 py-10 text-center text-[13px] text-[var(--muted)] italic">
            No running sets.
          </div>
        ) : (
          <div id="running-sets-table">
            {runningSets.map((set) => {
              const lines = allLines.filter((l) => l.receivingId === set.id);
              const partyName = nameByCode.get(set.beamReceivingFrom ?? "") || set.beamReceivingFrom || "—";
              const setNo = lines[0]?.setNo ?? "—";

              return (
                <div key={set.id} className="card mb-6" style={{ breakInside: "avoid" }}>
                  <div className="px-4 py-2 border-b-2 border-black flex flex-wrap items-baseline justify-between gap-3"
                    style={{ background: "#0f172a", color: "white" }}>
                    <span className="font-bold text-[14px] uppercase tracking-[0.06em]">
                      {set.vNo} <span className="text-[12px] font-normal opacity-70">( Set {setNo} )</span>
                    </span>
                    <span className="mono text-[12px] opacity-80">
                      {set.vDate} &middot; {partyName}
                      {set.sizingContNo && <> &middot; {set.sizingContNo}</>}
                    </span>
                  </div>

                  {lines.length === 0 ? (
                    <div className="px-4 py-4 text-[13px] text-[var(--muted)] italic">No beams in this set.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full" style={{ minWidth: 900 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 50 }}>#</th>
                            <th style={{ width: 120 }}>Beam No</th>
                            <th style={{ width: 80 }}>Beam Set</th>
                            <th style={{ width: 90 }}>Status</th>
                            <th style={{ width: 70 }}>Shed</th>
                            <th style={{ width: 70 }}>Loom</th>
                            <th className="text-right" style={{ width: 90 }}>Length</th>
                            <th className="text-right" style={{ width: 70 }}>Ends</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line, i) => {
                            const bm = beamMap.get(line.beamNo ?? "");
                            const prodForBeam = allProdSets.filter((ps) => ps.beamNo === line.beamNo);
                            const hasProd = prodForBeam.length > 0;
                            return (
                              <React.Fragment key={line.id}>
                                <tr className={hasProd ? "" : ""}>
                                  <td className="mono text-[11px] text-center">{i + 1}</td>
                                  <td className="mono font-bold text-[13px]">{line.beamNo ?? "—"}</td>
                                  <td className="mono text-[12px]">{line.beamSetNo ?? "—"}</td>
                                  <td className="text-[12px]">
                                    <span className={
                                      (bm?.statusWrk ?? line.beamStatus) === "PRODUCTION" ? "font-bold" :
                                      (bm?.statusWrk ?? line.beamStatus) === "KNOTTING" ? "font-bold text-[var(--accent)]" :
                                      ""
                                    }>
                                      {bm?.statusWrk ?? line.beamStatus ?? "—"}
                                    </span>
                                  </td>
                                  <td className="mono text-[12px]">{bm?.shed ?? "—"}</td>
                                  <td className="mono text-[12px]">{bm?.loomNo ?? "—"}</td>
                                  <td className="mono text-[12px] text-right">{fmt(bm?.length ?? line.beamLength)}</td>
                                  <td className="mono text-[12px] text-right">{fmt(bm?.ends ?? line.ends)}</td>
                                </tr>
                                {hasProd && (
                                  <tr>
                                    <td></td>
                                    <td colSpan={7} className="pb-2">
                                      <table className="w-full border border-[var(--border-light)]">
                                        <thead>
                                          <tr className="bg-gray-50">
                                            <th className="text-[11px]" style={{ width: 100 }}>Date</th>
                                            <th className="text-[11px]" style={{ width: 80 }}>V.No</th>
                                            <th className="text-[11px]" style={{ width: 60 }}>Loom</th>
                                            <th className="text-[11px] text-right" style={{ width: 60 }}>A</th>
                                            <th className="text-[11px] text-right" style={{ width: 60 }}>B</th>
                                            <th className="text-[11px] text-right" style={{ width: 60 }}>C</th>
                                            <th className="text-[11px] text-right" style={{ width: 60 }}>CP</th>
                                            <th className="text-[11px] text-right" style={{ width: 60 }}>PPC</th>
                                            <th className="text-[11px] text-right" style={{ width: 70 }}>Total</th>
                                            <th className="text-[11px] text-right" style={{ width: 80 }}>Rcvd Mtr</th>
                                            <th className="text-[11px] text-right" style={{ width: 80 }}>Shrinkage%</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {prodForBeam.map((ps) => {
                                            const parent = prodByProdId.get(ps.productionId);
                                            return (
                                              <tr key={ps.id}>
                                                <td className="mono text-[11px]">{parent?.vDate ?? "—"}</td>
                                                <td className="mono text-[11px]">{parent?.vNo ?? "—"}</td>
                                                <td className="mono text-[11px]">{ps.loomNo ?? "—"}</td>
                                                <td className="mono text-[11px] text-right">{fmt(ps.aCount)}</td>
                                                <td className="mono text-[11px] text-right">{fmt(ps.bCount)}</td>
                                                <td className="mono text-[11px] text-right">{fmt(ps.cCount)}</td>
                                                <td className="mono text-[11px] text-right">{fmt(ps.cpCount)}</td>
                                                <td className="mono text-[11px] text-right">{fmt(ps.ppcCount)}</td>
                                                <td className="mono text-[11px] text-right font-bold">{fmt(ps.totalCount)}</td>
                                                <td className="mono text-[11px] text-right">{fmt2(ps.rcvdMtr)}</td>
                                                <td className="mono text-[11px] text-right">{fmt2(ps.shrinkage)}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
