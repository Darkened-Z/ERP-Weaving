import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq } from "drizzle-orm";
import { DateBox } from "@/components/date-box";
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
  searchParams: Promise<{
    from?: string;
    to?: string;
    party?: string;
    set?: string;
    beam?: string;
    view?: string;
    loom?: string;
    shed?: string;
  }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const setFilter = p.set?.trim() ?? "";
  const beamFilter = p.beam?.trim() ?? "";
  const viewMode = p.view?.trim() ?? "";
  const loomFilter = p.loom?.trim() ?? "";
  const shedFilter = p.shed?.trim() ?? "";

  const [partyOpts, greys, accounts, setRaw, intContracts, extContracts] =
    await Promise.all([
      partyByNameOptions(),
      db
        .select({
          code: schema.greyConstruction.code,
          desc: schema.greyConstruction.description,
        })
        .from(schema.greyConstruction),
      db
        .select({
          code: schema.chartOfAccounts.code,
          desc: schema.chartOfAccounts.description,
        })
        .from(schema.chartOfAccounts),
      db
        .select({ setNo: schema.beams.setNo })
        .from(schema.beams)
        .groupBy(schema.beams.setNo),
      db
        .select({
          contNo: schema.intGreyConversionContract.contNo,
          rate: schema.intGreyConversionContract.convRatePerMtr,
        })
        .from(schema.intGreyConversionContract),
      db
        .select({
          contNo: schema.extGreyConvContract.contNo,
          rate: schema.extGreyConvContract.convRatePerMtr,
        })
        .from(schema.extGreyConvContract),
    ]);

  const greyDesc = new Map(greys.map((g) => [g.code, g.desc ?? ""]));
  const nameByCode = new Map(accounts.map((a) => [a.code, a.desc ?? ""]));
  const rateByContNo = new Map<string, number>();
  for (const c of intContracts)
    if (c.contNo) rateByContNo.set(c.contNo, c.rate ?? 0);
  for (const c of extContracts)
    if (c.contNo) rateByContNo.set(c.contNo, c.rate ?? 0);

  const setOpts = setRaw
    .filter((r) => r.setNo)
    .map((r) => ({ value: r.setNo!, label: r.setNo! }))
    .sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conds: any[] = [
    gte(schema.intDailyProduction.vDate, from),
    lte(schema.intDailyProduction.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conds.push(
      sql`(${schema.intDailyProduction.szgParty} LIKE ${pat} ESCAPE '\\' OR ${schema.intDailyProduction.convContParty} LIKE ${pat} ESCAPE '\\')`,
    );
  }
  if (setFilter) conds.push(eq(schema.intDailyProduction.setNo, setFilter));
  if (beamFilter) {
    const pat = `%${escLike(beamFilter)}%`;
    conds.push(
      sql`${schema.intDailyProductionSet.beamNo} LIKE ${pat} ESCAPE '\\'`,
    );
  }
  if (loomFilter) conds.push(eq(schema.intDailyProductionSet.loomNo, parseInt(loomFilter, 10)));
  if (shedFilter) conds.push(eq(schema.beams.shed, shedFilter));

  const raw = await db
    .select({
      beamNo: schema.intDailyProductionSet.beamNo,
      pBeamSetNo: schema.intDailyProductionSet.beamSetNo,
      loomNo: schema.intDailyProductionSet.loomNo,
      lineEnds: schema.intDailyProductionSet.ends,
      lineBLen: schema.intDailyProductionSet.bLength,
      totalCount: schema.intDailyProductionSet.totalCount,
      contNo: schema.intDailyProductionSet.contNo,
      dlvStatus: schema.intDailyProductionSet.dlvStatus,
      beamStatus: schema.intDailyProductionSet.beamStatus,
      wastWtKg: schema.intDailyProductionSet.wastWtKg,
      rejCount: schema.intDailyProductionSet.rejCount,
      vNo: schema.intDailyProduction.vNo,
      vDate: schema.intDailyProduction.vDate,
      designNo: schema.intDailyProduction.designNo,
      productBrand: schema.intDailyProduction.productBrand,
      productQuality: schema.intDailyProduction.productQuality,
      setNo: schema.intDailyProduction.setNo,
      shedNo: schema.intDailyProduction.shedNo,
      szgParty: schema.intDailyProduction.szgParty,
      bEnds: schema.beams.ends,
      bLen: schema.beams.length,
      bSzg: schema.beams.szgParty,
      brVno: schema.beams.brVno,
      brDate: schema.beams.brDate,
      knVno: schema.beams.knVno,
      knDate: schema.beams.knDate,
      bShed: schema.beams.shed,
      bSetNo: schema.beams.setNo,
      bBeamSetNo: schema.beams.beamSetNo,
      bYarnCount: schema.beams.yarnCount,
      bStatusWrk: schema.beams.statusWrk,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      eq(
        schema.intDailyProductionSet.productionId,
        schema.intDailyProduction.id,
      ),
    )
    .leftJoin(
      schema.beams,
      eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo),
    )
    .where(and(...conds))
    .orderBy(
      schema.intDailyProductionSet.beamNo,
      schema.intDailyProduction.designNo,
      schema.intDailyProduction.vDate,
    );

  const filtered = raw.filter((r) => r.beamNo && (r.totalCount ?? 0) > 0);

  type Line = {
    vNo: string;
    vDate: string;
    meter: number;
    rate: number;
    amount: number;
    status: string;
    wastWtKg: number;
    loomNo: number;
  };
  type DesignGrp = {
    designNo: string;
    brand: string;
    quality: string;
    qualityDesc: string;
    lines: Line[];
    totalMtr: number;
    totalAmt: number;
  };
  type Block = {
    beamNo: string;
    beamSetNo: string;
    setNo: string;
    ends: number;
    beamLength: number;
    shed: string;
    loomNo: number;
    szgParty: string;
    szgName: string;
    brVno: string;
    brDate: string;
    knVno: string;
    knDate: string;
    lastDate: string;
    warpInfo: string;
    rCut: string;
    totalRej: number;
    designs: DesignGrp[];
    totalMtr: number;
    totalAmt: number;
    totalLines: number;
    balMtr: number;
    shrinkPct: number;
  };

  const beamMap = new Map<string, typeof filtered>();
  for (const r of filtered) {
    const k = r.beamNo!;
    if (!beamMap.has(k)) beamMap.set(k, []);
    beamMap.get(k)!.push(r);
  }

  const blocks: Block[] = [];
  for (const [beamNo, rows] of beamMap) {
    const f = rows[0];
    const ends = f.lineEnds ?? f.bEnds ?? 0;
    const beamLength = f.lineBLen ?? f.bLen ?? 0;
    const szg = f.bSzg ?? f.szgParty ?? "";

    const dMap = new Map<string, typeof rows>();
    for (const r of rows) {
      const dk = r.designNo ?? "-";
      if (!dMap.has(dk)) dMap.set(dk, []);
      dMap.get(dk)!.push(r);
    }

    const designs: DesignGrp[] = [];
    for (const [dNo, dRows] of dMap) {
      const df = dRows[0];
      const lines: Line[] = dRows.map((r) => {
        const m = r.totalCount ?? 0;
        const rate = rateByContNo.get(r.contNo ?? "") ?? 0;
        return {
          vNo: r.vNo ?? "",
          vDate: r.vDate ?? "",
          meter: m,
          rate,
          amount: m * rate,
          status: r.beamStatus ?? "",
          wastWtKg: r.wastWtKg ?? 0,
          loomNo: r.loomNo ?? 0,
        };
      });
      designs.push({
        designNo: dNo,
        brand: df.productBrand ?? "",
        quality: df.productQuality ?? "",
        qualityDesc: greyDesc.get(df.productQuality ?? "") ?? "",
        lines,
        totalMtr: lines.reduce((s, l) => s + l.meter, 0),
        totalAmt: lines.reduce((s, l) => s + l.amount, 0),
      });
    }

    const totalMtr = designs.reduce((s, d) => s + d.totalMtr, 0);
    const totalAmt = designs.reduce((s, d) => s + d.totalAmt, 0);
    const totalLines = designs.reduce((s, d) => s + d.lines.length, 0);
    const totalRej = rows.reduce((s, r) => s + (r.rejCount ?? 0), 0);
    const balMtr = beamLength - totalMtr;
    const loomNo = f.loomNo ?? 0;
    const dates = rows.map((r) => r.vDate ?? "").filter(Boolean);
    const lastDate = dates.length ? dates.sort().pop()! : "";
    const lastStatus = rows[rows.length - 1]?.beamStatus ?? "";
    const rCut = (f.bStatusWrk ?? "").toUpperCase() === "EMPTY" ? "L-ROLL" : lastStatus;

    blocks.push({
      beamNo,
      beamSetNo: f.pBeamSetNo ?? f.bBeamSetNo ?? "",
      setNo: f.setNo ?? f.bSetNo ?? "",
      ends,
      beamLength,
      shed: f.bShed ?? f.shedNo ?? "",
      loomNo,
      szgParty: szg,
      szgName: nameByCode.get(szg) ?? szg,
      brVno: f.brVno ?? "",
      brDate: f.brDate ?? "",
      knVno: f.knVno ?? "",
      knDate: f.knDate ?? "",
      lastDate,
      warpInfo: f.bYarnCount ?? "",
      rCut,
      totalRej,
      designs,
      totalMtr,
      totalAmt,
      totalLines,
      balMtr,
      shrinkPct: beamLength > 0 ? (balMtr / beamLength) * 100 : 0,
    });
  }

  const grandMtr = blocks.reduce((s, b) => s + b.totalMtr, 0);
  const grandAmt = blocks.reduce((s, b) => s + b.totalAmt, 0);
  const grandBLen = blocks.reduce((s, b) => s + b.beamLength, 0);
  const grandBal = grandBLen - grandMtr;
  const grandShrink = grandBLen > 0 ? (grandBal / grandBLen) * 100 : 0;

  const excelRows = blocks.flatMap((b) =>
    b.designs.flatMap((d) =>
      d.lines.map((l) => ({
        setNo: b.setNo,
        beamNo: b.beamNo,
        beamSetNo: b.beamSetNo,
        ends: b.ends,
        beamLength: b.beamLength,
        shed: b.shed,
        szgParty: b.szgName,
        designNo: d.designNo,
        brand: d.brand,
        quality: d.qualityDesc || d.quality,
        vDate: l.vDate,
        vNo: l.vNo,
        meter: l.meter,
        rate: l.rate,
        amount: Math.round(l.amount),
        status: l.status,
        wastWtKg: l.wastWtKg,
        loomNo: l.loomNo,
      })),
    ),
  );

  return (
    <Shell active="rpt-grey-shrinkage">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Shrinkage Report</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {blocks.length} beam{blocks.length !== 1 ? "s" : ""} &middot;{" "}
              {from} to {to} &middot; avg shrinkage{" "}
              <span className="mono">{fmt2(grandShrink)}%</span>
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "setNo", label: "Set" },
                { key: "beamNo", label: "Beam" },
                { key: "beamSetNo", label: "Set Beam" },
                { key: "ends", label: "Ends" },
                { key: "beamLength", label: "Beam Length" },
                { key: "shed", label: "Shed" },
                { key: "szgParty", label: "Party SZG" },
                { key: "designNo", label: "Design" },
                { key: "brand", label: "Brand" },
                { key: "quality", label: "Quality" },
                { key: "vDate", label: "Date" },
                { key: "vNo", label: "V.No" },
                { key: "meter", label: "Meter" },
                { key: "rate", label: "Rate" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
                { key: "wastWtKg", label: "Wst Wt Kg" },
                { key: "loomNo", label: "Loom" },
              ]}
              filename="shrinkage-report"
              sheetName="Shrinkage"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Shrinkage Report</h1>
          <div className="mono text-[12px] mt-2">
            {from} to {to}
            {setFilter ? ` · Set ${setFilter}` : ""}
            {beamFilter ? ` · Beam ${beamFilter}` : ""}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-2 sm:grid-cols-7 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Date From</label>
            <DateBox
              name="from"
              defaultValue={from}
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <DateBox
              name="to"
              defaultValue={to}
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">Set</label>
            <Combobox
              name="set"
              options={setOpts}
              defaultValue={setFilter}
              placeholder="All sets"
            />
          </div>
          <div>
            <label className="label block mb-1">Beam</label>
            <input
              type="text"
              name="beam"
              defaultValue={beamFilter}
              className="input-box mono"
              placeholder="Beam #"
            />
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <Combobox
              name="party"
              options={partyOpts}
              defaultValue={party}
              placeholder="All parties"
            />
          </div>
          <div>
            <label className="label block mb-1">Loom #</label>
            <input
              type="text"
              name="loom"
              defaultValue={loomFilter}
              className="input-box mono"
              placeholder="Loom #"
            />
          </div>
          <div>
            <label className="label block mb-1">Shed</label>
            <input
              type="text"
              name="shed"
              defaultValue={shedFilter}
              className="input-box mono"
              placeholder="Shed"
            />
          </div>
          <input type="hidden" name="view" value={viewMode || "beam"} />
          <div className="sm:col-span-7 flex gap-2 items-center">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a
              href="/reports/grey/shrinkage"
              className="btn btn-outline btn-sm"
            >
              Clear
            </a>
            <span className="ml-auto flex gap-1">
              <a
                href={`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${party ? `&party=${encodeURIComponent(party)}` : ""}${setFilter ? `&set=${encodeURIComponent(setFilter)}` : ""}${beamFilter ? `&beam=${encodeURIComponent(beamFilter)}` : ""}${loomFilter ? `&loom=${encodeURIComponent(loomFilter)}` : ""}${shedFilter ? `&shed=${encodeURIComponent(shedFilter)}` : ""}&view=set`}
                className={`btn btn-sm ${viewMode === "set" ? "" : "btn-outline"}`}
              >
                Set Wise
              </a>
              <a
                href={`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${party ? `&party=${encodeURIComponent(party)}` : ""}${setFilter ? `&set=${encodeURIComponent(setFilter)}` : ""}${beamFilter ? `&beam=${encodeURIComponent(beamFilter)}` : ""}${loomFilter ? `&loom=${encodeURIComponent(loomFilter)}` : ""}${shedFilter ? `&shed=${encodeURIComponent(shedFilter)}` : ""}&view=beam`}
                className={`btn btn-sm ${viewMode !== "set" ? "" : "btn-outline"}`}
              >
                Beam Wise
              </a>
            </span>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{blocks.length}</div>
            <div className="stat-label">Beams</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt2(grandMtr)}</div>
            <div className="stat-label">Total Meter</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(grandAmt)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt2(grandBal)}</div>
            <div className="stat-label">Balance Mtr</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt2(grandShrink)}%
            </div>
            <div className="stat-label">Avg Shrinkage</div>
          </div>
        </div>

        {blocks.length === 0 ? (
          <div className="text-center text-[var(--muted)] py-12">
            No beams in selected range
          </div>
        ) : viewMode === "set" ? (
          (() => {
            const setGroups = new Map<string, Block[]>();
            for (const b of blocks) {
              const k = b.setNo || "—";
              if (!setGroups.has(k)) setGroups.set(k, []);
              setGroups.get(k)!.push(b);
            }
            const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${party ? `&party=${encodeURIComponent(party)}` : ""}${loomFilter ? `&loom=${encodeURIComponent(loomFilter)}` : ""}${shedFilter ? `&shed=${encodeURIComponent(shedFilter)}` : ""}`;
            return Array.from(setGroups.entries()).map(([sNo, sBlocks]) => {
              const sMtr = sBlocks.reduce((s, b) => s + b.totalMtr, 0);
              const sLen = sBlocks.reduce((s, b) => s + b.beamLength, 0);
              const sBal = sLen - sMtr;
              const sRej = sBlocks.reduce((s, b) => s + b.totalRej, 0);
              const sShr = sLen > 0 ? (sBal / sLen) * 100 : 0;
              return (
                <div key={sNo} className="mb-8 break-inside-avoid">
                  <div className="border-2 border-black bg-[#f5f5f5] px-4 py-2 flex items-center justify-between">
                    <span className="font-bold text-[14px]">Set # {sNo}</span>
                    <span className="mono text-[12px] text-[var(--muted)]">{sBlocks.length} beam{sBlocks.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="overflow-x-auto border-x-2 border-b-2 border-black">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th>L#</th>
                          <th>Shed</th>
                          <th>BmSet#</th>
                          <th>Beam#</th>
                          <th className="text-right">B.Length</th>
                          <th className="text-right">Meter</th>
                          <th className="text-right">Rej</th>
                          <th className="text-right">Diff.Mtr</th>
                          <th className="text-right">Shr%</th>
                          <th>Knt.Date</th>
                          <th>L-R Date</th>
                          <th>Wrp Cont</th>
                          <th>Status</th>
                          <th className="no-print" style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sBlocks.map((b) => (
                          <tr key={b.beamNo}>
                            <td className="mono">{b.loomNo || "-"}</td>
                            <td className="mono">{b.shed || "-"}</td>
                            <td className="mono">{b.beamSetNo || "-"}</td>
                            <td className="mono font-bold">{b.beamNo}</td>
                            <td className="mono text-right">{fmt(b.beamLength)}</td>
                            <td className="mono text-right">{fmt2(b.totalMtr)}</td>
                            <td className="mono text-right">{b.totalRej || "-"}</td>
                            <td className="mono text-right">{fmt2(b.balMtr)}</td>
                            <td className="mono text-right">{fmt2(b.shrinkPct)}%</td>
                            <td className="mono text-[12px]">{b.knDate || "-"}</td>
                            <td className="mono text-[12px]">{b.lastDate || "-"}</td>
                            <td className="text-[12px]">{b.warpInfo || "-"}</td>
                            <td className="text-[12px]">{b.rCut || "-"}</td>
                            <td className="no-print">
                              <a
                                href={`?${qs}&beam=${encodeURIComponent(b.beamNo)}&view=beam`}
                                className="btn btn-sm btn-outline"
                                style={{ padding: "1px 8px", fontSize: 11 }}
                                title="Show serial details for this beam"
                              >
                                S
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                          <td colSpan={4}>Set Total ({sBlocks.length})</td>
                          <td className="mono text-right">{fmt(sLen)}</td>
                          <td className="mono text-right">{fmt2(sMtr)}</td>
                          <td className="mono text-right">{sRej || "-"}</td>
                          <td className="mono text-right">{fmt2(sBal)}</td>
                          <td className="mono text-right">{fmt2(sShr)}%</td>
                          <td colSpan={5}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            });
          })()
        ) : (
          blocks.map((b) => (
            <div key={b.beamNo} className="mb-10 break-inside-avoid">
              <div className="border-2 border-black">
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-x-6 gap-y-1 p-3 bg-[#f5f5f5] text-[13px]">
                  <div>
                    <span className="font-bold">Set #</span>{" "}
                    <span className="mono">{b.setNo || "-"}</span>
                  </div>
                  <div>
                    <span className="font-bold">Beam #</span>{" "}
                    <span className="mono">{b.beamNo}</span>
                  </div>
                  <div>
                    <span className="font-bold">Set Beam</span>{" "}
                    <span className="mono">{b.beamSetNo || "-"}</span>
                  </div>
                  <div>
                    <span className="font-bold">Ends</span>{" "}
                    <span className="mono">{fmt(b.ends)}</span>
                  </div>
                  <div>
                    <span className="font-bold">Beam Length</span>{" "}
                    <span className="mono">{fmt(b.beamLength)}</span>
                  </div>
                  <div>
                    <span className="font-bold">Bal. Mtr</span>{" "}
                    <span className="mono">{fmt2(b.balMtr)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-x-6 gap-y-1 p-3 border-t border-black text-[13px]">
                  <div>
                    <span className="font-bold">Knotting</span>{" "}
                    <span className="mono">{b.knDate || "-"}</span>
                  </div>
                  <div>
                    <span className="font-bold">Shed</span>{" "}
                    <span className="mono">{b.shed || "-"}</span>
                  </div>
                  <div>
                    <span className="font-bold">BR.V.NO</span>{" "}
                    <span className="mono">{b.brVno || "-"}</span>
                  </div>
                  <div>
                    <span className="font-bold">BR.V.Date</span>{" "}
                    <span className="mono">{b.brDate || "-"}</span>
                  </div>
                  <div>
                    <span className="font-bold">K.V.NO</span>{" "}
                    <span className="mono">{b.knVno || "-"}</span>
                  </div>
                  <div>
                    <span className="font-bold">Party SZG</span>{" "}
                    <span className="text-[12px]">{b.szgName || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border-x-2 border-b-2 border-black">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Design</th>
                      <th>Brand</th>
                      <th>Quality</th>
                      <th>Date</th>
                      <th>V.#</th>
                      <th className="text-right">Mtr</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Amt</th>
                      <th>Status</th>
                      <th className="text-right">Wst Wt Kg</th>
                      <th className="text-right">Loom</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.designs.flatMap((d) => [
                      ...d.lines.map((l, i) => (
                        <tr key={`${d.designNo}-${i}`}>
                          <td className="mono font-bold">{d.designNo}</td>
                          <td className="text-[13px]">
                            {d.brand || "-"}
                          </td>
                          <td className="text-[12px]">
                            {d.qualityDesc || d.quality || "-"}
                          </td>
                          <td className="mono text-[13px]">{l.vDate}</td>
                          <td className="mono text-[13px]">{l.vNo}</td>
                          <td className="mono text-right">
                            {fmt2(l.meter)}
                          </td>
                          <td className="mono text-right">
                            {l.rate > 0 ? fmt2(l.rate) : "-"}
                          </td>
                          <td className="mono text-right">
                            {l.rate > 0 ? fmt(l.amount) : "-"}
                          </td>
                          <td className="text-[12px]">
                            {l.status || "-"}
                          </td>
                          <td className="mono text-right">
                            {l.wastWtKg > 0 ? fmt2(l.wastWtKg) : "-"}
                          </td>
                          <td className="mono text-right">
                            {l.loomNo || "-"}
                          </td>
                        </tr>
                      )),
                      b.designs.length > 1 ? (
                        <tr
                          key={`${d.designNo}-sub`}
                          style={{
                            borderTop: "1px solid #999",
                            fontWeight: 600,
                            fontSize: "12px",
                          }}
                        >
                          <td colSpan={5} className="text-right">
                            Design {d.designNo} ({d.lines.length})
                          </td>
                          <td className="mono text-right">
                            {fmt2(d.totalMtr)}
                          </td>
                          <td></td>
                          <td className="mono text-right">
                            {fmt(d.totalAmt)}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      ) : null,
                    ])}
                  </tbody>
                  <tfoot>
                    <tr
                      style={{
                        borderTop: "2px solid black",
                        fontWeight: 700,
                      }}
                    >
                      <td colSpan={5}>
                        Beam Total ({b.totalLines})
                      </td>
                      <td className="mono text-right">
                        {fmt2(b.totalMtr)}
                      </td>
                      <td></td>
                      <td className="mono text-right">
                        {fmt(b.totalAmt)}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                    <tr className="text-[13px]">
                      <td colSpan={5}>Shrinkage</td>
                      <td className="mono text-right">
                        {fmt2(b.balMtr)}
                      </td>
                      <td colSpan={2}></td>
                      <td className="mono font-bold" colSpan={3}>
                        {fmt2(b.shrinkPct)}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))
        )}

        {blocks.length > 1 && (
          <div className="border-2 border-black p-4">
            <table className="w-full">
              <tbody>
                <tr style={{ fontWeight: 700 }}>
                  <td className="w-1/2">Grand Total</td>
                  <td className="mono text-right">{fmt2(grandMtr)} mtr</td>
                  <td className="mono text-right">{fmt(grandAmt)}</td>
                </tr>
                <tr className="text-[13px]">
                  <td>Shrinkage</td>
                  <td className="mono text-right">{fmt2(grandBal)} mtr</td>
                  <td className="mono font-bold text-right">
                    {fmt2(grandShrink)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
