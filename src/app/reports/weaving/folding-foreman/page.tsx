import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq } from "drizzle-orm";
import { today as todayFn } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function daysBackFrom(d: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - (n - 1));
  return dt.toISOString().slice(0, 10);
}

export default async function FoldingForemanPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; foreman?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const to = params.to?.trim() || today;
  const from = params.from?.trim() || daysBackFrom(to, 30);
  const foremanQ = params.foreman?.trim() || "";

  const conds = [
    gte(schema.intDailyProduction.vDate, from),
    lte(schema.intDailyProduction.vDate, to),
  ];

  const raw = await db
    .select({
      foreman: schema.looms.forman,
      a: sql<number>`coalesce(sum(${schema.intDailyProductionSet.aCount}), 0)`,
      b: sql<number>`coalesce(sum(${schema.intDailyProductionSet.bCount}), 0)`,
      c: sql<number>`coalesce(sum(${schema.intDailyProductionSet.cCount}), 0)`,
      cp: sql<number>`coalesce(sum(${schema.intDailyProductionSet.cpCount}), 0)`,
      ppc: sql<number>`coalesce(sum(${schema.intDailyProductionSet.ppcCount}), 0)`,
      rej: sql<number>`coalesce(sum(${schema.intDailyProductionSet.rejCount}), 0)`,
      total: sql<number>`coalesce(sum(${schema.intDailyProductionSet.totalCount}), 0)`,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id)
    )
    .leftJoin(schema.beams, eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo))
    .leftJoin(schema.looms, eq(schema.beams.loomNo, schema.looms.loomNo))
    .where(and(...conds))
    .groupBy(schema.looms.forman);

  const rows = raw
    .filter((r) => !foremanQ || (r.foreman ?? "").toLowerCase().includes(foremanQ.toLowerCase()))
    .map((r) => ({
      foreman: r.foreman ?? "-",
      a: r.a ?? 0,
      b: r.b ?? 0,
      c: r.c ?? 0,
      cp: r.cp ?? 0,
      ppc: r.ppc ?? 0,
      rej: r.rej ?? 0,
      total: r.total ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  const totA = rows.reduce((s, r) => s + r.a, 0);
  const totB = rows.reduce((s, r) => s + r.b, 0);
  const totC = rows.reduce((s, r) => s + r.c, 0);
  const totCP = rows.reduce((s, r) => s + r.cp, 0);
  const totPPC = rows.reduce((s, r) => s + r.ppc, 0);
  const totRej = rows.reduce((s, r) => s + r.rej, 0);
  const totTot = rows.reduce((s, r) => s + r.total, 0);

  const excelRows = rows.map((r) => ({
    foreman: r.foreman,
    a: Math.round(r.a),
    b: Math.round(r.b),
    c: Math.round(r.c),
    cp: Math.round(r.cp),
    ppc: Math.round(r.ppc),
    rej: Math.round(r.rej),
    total: Math.round(r.total),
  }));

  return (
    <Shell active="w-folding-foreman">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Folding — By Foreman</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} foremen &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "foreman", label: "Foreman" },
                { key: "a", label: "A" },
                { key: "b", label: "B" },
                { key: "c", label: "C" },
                { key: "cp", label: "CP" },
                { key: "ppc", label: "PPC" },
                { key: "rej", label: "Rej" },
                { key: "total", label: "Total" },
              ]}
              filename="folding-by-foreman"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Folding — By Foreman</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
            {foremanQ ? ` · Foreman: ${foremanQ}` : ""}
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
            <label className="label block mb-1">Foreman</label>
            <input
              type="text"
              name="foreman"
              defaultValue={foremanQ}
              className="input-box mono"
              placeholder="Filter"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/folding-foreman" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Foreman</th>
                <th className="text-right">A</th>
                <th className="text-right">B</th>
                <th className="text-right">C</th>
                <th className="text-right">CP</th>
                <th className="text-right">PPC</th>
                <th className="text-right">Rej</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-8">
                    No data
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.foreman}</td>
                    <td className="mono text-right">{fmt(r.a)}</td>
                    <td className="mono text-right">{fmt(r.b)}</td>
                    <td className="mono text-right">{fmt(r.c)}</td>
                    <td className="mono text-right">{fmt(r.cp)}</td>
                    <td className="mono text-right">{fmt(r.ppc)}</td>
                    <td className="mono text-right">{fmt(r.rej)}</td>
                    <td className="mono text-right font-bold">{fmt(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td>GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(totA)}</td>
                  <td className="mono text-right">{fmt(totB)}</td>
                  <td className="mono text-right">{fmt(totC)}</td>
                  <td className="mono text-right">{fmt(totCP)}</td>
                  <td className="mono text-right">{fmt(totPPC)}</td>
                  <td className="mono text-right">{fmt(totRej)}</td>
                  <td className="mono text-right">{fmt(totTot)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
