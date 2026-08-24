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

export default async function CountsAccountsDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; design?: string; party?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from?.trim() || monthsBackFrom(today, 3);
  const to = params.to?.trim() || today;
  const designQ = params.design?.trim() || "";
  const partyQ = params.party?.trim() || "";

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 4`);

  const conds = [
    gte(schema.intDailyProduction.vDate, from),
    lte(schema.intDailyProduction.vDate, to),
  ];
  if (designQ) conds.push(eq(schema.intDailyProduction.designNo, designQ));
  if (partyQ) conds.push(eq(schema.intDailyProduction.convContParty, partyQ));

  const consumed = await db
    .select({
      designNo: schema.intDailyProduction.designNo,
      yarnCount: schema.beams.yarnCount,
      lbs: sql<number>`coalesce(sum(${schema.beams.weight}), 0)`,
      mtrs: sql<number>`coalesce(sum(${schema.intDailyProductionSet.rcvdMtr}), 0)`,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id)
    )
    .innerJoin(schema.beams, eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo))
    .where(and(...conds))
    .groupBy(schema.intDailyProduction.designNo, schema.beams.yarnCount);

  const rows = consumed
    .filter((r) => r.designNo && r.yarnCount)
    .map((r) => ({
      designNo: r.designNo ?? "-",
      count: r.yarnCount ?? "-",
      lbs: r.lbs ?? 0,
      mtrs: r.mtrs ?? 0,
    }))
    .sort((a, b) => (a.designNo + a.count).localeCompare(b.designNo + b.count));

  const totLbs = rows.reduce((s, r) => s + r.lbs, 0);
  const totMtrs = rows.reduce((s, r) => s + r.mtrs, 0);

  const partyOpts = parties
    .filter((p) => p.description)
    .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));

  const excelRows = rows.map((r) => ({
    designNo: r.designNo,
    count: r.count,
    lbs: Math.round(r.lbs),
    mtrs: Math.round(r.mtrs),
  }));

  return (
    <Shell active="w-counts-design">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Weaving Counts Accounts — By Design</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} rows &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "designNo", label: "Design No" },
                { key: "count", label: "Count" },
                { key: "lbs", label: "Consumed Lbs" },
                { key: "mtrs", label: "Received Mtrs" },
              ]}
              filename="weaving-counts-accounts-design"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Weaving Counts Accounts — By Design</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
            {designQ ? ` · Design: ${designQ}` : ""}
            {partyQ ? ` · Party: ${partyQ}` : ""}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 no-print"
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
            <label className="label block mb-1">Design No</label>
            <input
              type="text"
              name="design"
              defaultValue={designQ}
              className="input-box mono"
              placeholder="Design"
            />
          </div>
          <div>
            <label className="label block mb-1">Conv. Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={partyQ} placeholder="Party" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/counts-accounts-design" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{rows.length}</div>
            <div className="stat-label">Design × Count</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totLbs)}</div>
            <div className="stat-label">Consumed Lbs</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totMtrs)}</div>
            <div className="stat-label">Received Mtrs</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Design No</th>
                <th>Count</th>
                <th className="text-right">Consumed Lbs</th>
                <th className="text-right">Received Mtrs</th>
                <th className="text-right">Lbs / Mtr</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-[var(--muted)] py-8">
                    No data for selected period
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.designNo}-${r.count}-${i}`}>
                    <td className="mono">{r.designNo}</td>
                    <td className="mono">{r.count}</td>
                    <td className="mono text-right">{fmt(r.lbs)}</td>
                    <td className="mono text-right">{fmt(r.mtrs)}</td>
                    <td className="mono text-right">{r.mtrs > 0 ? fmt2(r.lbs / r.mtrs) : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(totLbs)}</td>
                  <td className="mono text-right">{fmt(totMtrs)}</td>
                  <td className="mono text-right">{totMtrs > 0 ? fmt2(totLbs / totMtrs) : "-"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
