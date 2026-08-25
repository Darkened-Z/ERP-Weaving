import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function monthsBackFrom(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default async function SizingWarpingConsumptionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from?.trim() || monthsBackFrom(today, 3);
  const to = params.to?.trim() || today;
  const partyQ = params.party?.trim() || "";

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 4`);
  const partyDescToCode = new Map(parties.map((p) => [p.description, p.code]));

  const yarnCountRows = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts);
  const yarnCountMap = new Map(yarnCountRows.map((r) => [r.countCode, r.description]));

  const contractConds = [
    gte(schema.intBeamContractExtWs.contDate, from),
    lte(schema.intBeamContractExtWs.contDate, to),
  ];
  if (partyQ) contractConds.push(eq(schema.intBeamContractExtWs.party, partyQ));

  const contracts = await db
    .select()
    .from(schema.intBeamContractExtWs)
    .where(and(...contractConds))
    .orderBy(schema.intBeamContractExtWs.contDate);

  const contractIds = contracts.map((c) => c.id);
  const details = contractIds.length
    ? await db
        .select()
        .from(schema.intBeamContractExtWsDetail)
        .where(sql`${schema.intBeamContractExtWsDetail.contractId} IN (${sql.raw(contractIds.join(","))})`)
    : [];

  const detailsByContract = new Map<number, typeof details>();
  for (const d of details) {
    if (!detailsByContract.has(d.contractId)) detailsByContract.set(d.contractId, []);
    detailsByContract.get(d.contractId)!.push(d);
  }

  const partyToWarpedMtr = new Map<string, number>();
  const parties2 = Array.from(new Set(contracts.map((c) => c.warpingParty).filter(Boolean))) as string[];
  if (parties2.length) {
    const recRows = await db
      .select({
        party: schema.intWarpedBeamReceiving.beamReceivingFrom,
        totalMtr: sql<number>`coalesce(sum(${schema.intWarpedBeamReceivingLine.length}), 0)`,
      })
      .from(schema.intWarpedBeamReceivingLine)
      .innerJoin(
        schema.intWarpedBeamReceiving,
        eq(schema.intWarpedBeamReceivingLine.receivingId, schema.intWarpedBeamReceiving.id)
      )
      .where(
        and(
          gte(schema.intWarpedBeamReceiving.vDate, from),
          lte(schema.intWarpedBeamReceiving.vDate, to)
        )
      )
      .groupBy(schema.intWarpedBeamReceiving.beamReceivingFrom);

    for (const r of recRows) if (r.party) partyToWarpedMtr.set(r.party, r.totalMtr ?? 0);
  }

  type Row = {
    contNo: string;
    contDate: string;
    party: string;
    warpingParty: string;
    countCode: string;
    ends: number;
    wtPerMtr: number;
    warpedMtr: number;
    consumedLbs: number;
  };

  const rows: Row[] = [];
  for (const c of contracts) {
    const dets = detailsByContract.get(c.id) ?? [];
    const warpedMtr = partyToWarpedMtr.get(c.warpingParty ?? "") ?? 0;
    if (dets.length === 0) {
      rows.push({
        contNo: c.contNo,
        contDate: c.contDate,
        party: c.party ?? "-",
        warpingParty: c.warpingParty ?? "-",
        countCode: "-",
        ends: c.ends ?? 0,
        wtPerMtr: c.wtPerMtr ?? 0,
        warpedMtr,
        consumedLbs: warpedMtr * (c.wtPerMtr ?? 0),
      });
    } else {
      for (const d of dets) {
        rows.push({
          contNo: c.contNo,
          contDate: c.contDate,
          party: c.party ?? "-",
          warpingParty: c.warpingParty ?? "-",
          countCode: d.countCode ?? "-",
          ends: d.ends ?? 0,
          wtPerMtr: d.wtPerMtr ?? 0,
          warpedMtr,
          consumedLbs: warpedMtr * (d.wtPerMtr ?? 0),
        });
      }
    }
  }

  const totMtr = rows.reduce((s, r) => s + r.warpedMtr, 0);
  const totLbs = rows.reduce((s, r) => s + r.consumedLbs, 0);

  const partyOpts = parties
    .filter((p) => p.description)
    .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));

  const excelRows = rows.map((r) => ({
    contNo: r.contNo,
    contDate: r.contDate,
    party: r.party,
    warpingParty: r.warpingParty,
    countCode: r.countCode,
    ends: r.ends,
    wtPerMtr: r.wtPerMtr,
    warpedMtr: Math.round(r.warpedMtr),
    consumedLbs: Math.round(r.consumedLbs),
  }));

  return (
    <Shell active="w-szg-wrp">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Sizing / Warping Count Consumption</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {contracts.length} contracts &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "contNo", label: "Cont No" },
                { key: "contDate", label: "Cont Date" },
                { key: "party", label: "Party" },
                { key: "warpingParty", label: "Warping Party" },
                { key: "countCode", label: "Count" },
                { key: "ends", label: "Ends" },
                { key: "wtPerMtr", label: "Wt/Mtr" },
                { key: "warpedMtr", label: "Warped Mtr" },
                { key: "consumedLbs", label: "Consumed Lbs" },
              ]}
              filename="sizing-warping-consumption"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Sizing / Warping Count Consumption</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
            {partyQ ? ` · Party: ${partyQ}` : ""}
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
          <div>
            <label className="label block mb-1">Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={partyQ} placeholder="Party" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/sizing-warping-consumption" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{contracts.length}</div>
            <div className="stat-label">Contracts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totMtr)}</div>
            <div className="stat-label">Warped Mtrs</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totLbs)}</div>
            <div className="stat-label">Consumed Lbs</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Cont No</th>
                <th>Date</th>
                <th>Party</th>
                <th>Warping Party</th>
                <th>Count</th>
                <th className="text-right">Ends</th>
                <th className="text-right">Wt/Mtr</th>
                <th className="text-right">Warped Mtr</th>
                <th className="text-right">Consumed Lbs</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--muted)] py-8">
                    No data
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const partyCode = partyDescToCode.get(r.party);
                  const wpCode = partyDescToCode.get(r.warpingParty);
                  const countDesc = yarnCountMap.get(r.countCode);
                  return (
                  <tr key={i}>
                    <td className="mono">{r.contNo}</td>
                    <td className="mono">{r.contDate}</td>
                    <td className="text-[13px]">
                      {r.party}
                      {partyCode ? ` (${partyCode})` : ""}
                    </td>
                    <td className="text-[13px]">
                      {r.warpingParty}
                      {wpCode ? ` (${wpCode})` : ""}
                    </td>
                    <td className="mono">
                      {r.countCode}
                      {countDesc && (
                        <div className="text-[11px] text-[var(--muted)]">{countDesc}</div>
                      )}
                    </td>
                    <td className="mono text-right">{fmt(r.ends)}</td>
                    <td className="mono text-right">{fmt2(r.wtPerMtr)}</td>
                    <td className="mono text-right">{fmt(r.warpedMtr)}</td>
                    <td className="mono text-right font-bold">{fmt(r.consumedLbs)}</td>
                  </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={7}>GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(totMtr)}</td>
                  <td className="mono text-right">{fmt(totLbs)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
