import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq } from "drizzle-orm";
import { today as todayFn } from "@/lib/time";
import { DateBox } from "@/components/date-box";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function daysBackFrom(d: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - (n - 1));
  return dt.toISOString().slice(0, 10);
}

export default async function DailyFoldingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; shed?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const to = params.to?.trim() || today;
  const from = params.from?.trim() || daysBackFrom(to, 7);
  const shedQ = params.shed?.trim() || "";

  const conds = [
    gte(schema.intDailyProduction.vDate, from),
    lte(schema.intDailyProduction.vDate, to),
  ];
  if (shedQ) conds.push(eq(schema.intDailyProduction.shedNo, shedQ));

  // Grouped in JS rather than SQL because the loom has to be resolved per set
  // row first. Daily production pairs a counts row with the beam row at the SAME
  // index, so the 2nd, 3rd ... than of a single-beam voucher carries no beam of
  // its own — grouping on the joined loom put those rows under a "-" loom. When
  // the whole voucher ran on ONE beam that beam is unambiguous, so its loom
  // stands for every row of the voucher. (Same rule the despatch thans list uses.)
  const setRows = await db
    .select({
      productionId: schema.intDailyProductionSet.productionId,
      vDate: schema.intDailyProduction.vDate,
      shed: schema.intDailyProduction.shedNo,
      beamNo: schema.intDailyProductionSet.beamNo,
      loomNo: schema.beams.loomNo,
      a: schema.intDailyProductionSet.aCount,
      b: schema.intDailyProductionSet.bCount,
      c: schema.intDailyProductionSet.cCount,
      cp: schema.intDailyProductionSet.cpCount,
      ppc: schema.intDailyProductionSet.ppcCount,
      rej: schema.intDailyProductionSet.rejCount,
      total: schema.intDailyProductionSet.totalCount,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id)
    )
    .leftJoin(schema.beams, eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo))
    .where(and(...conds))
    .orderBy(schema.intDailyProduction.vDate);

  const loomsOfVoucher = new Map<number, Set<string>>();
  for (const r of setRows) {
    if (r.loomNo == null) continue;
    const set = loomsOfVoucher.get(r.productionId) ?? new Set<string>();
    set.add(String(r.loomNo));
    loomsOfVoucher.set(r.productionId, set);
  }

  const agg = new Map<string, { date: string; shed: string; loom: string; a: number; b: number; c: number; cp: number; ppc: number; rej: number; total: number }>();
  for (const r of setRows) {
    let loom = r.loomNo != null ? String(r.loomNo) : "";
    if (!loom) {
      const only = loomsOfVoucher.get(r.productionId);
      if (only && only.size === 1) loom = [...only][0];
    }
    const shed = r.shed ?? "-";
    const key = `${r.vDate}|${shed}|${loom || "-"}`;
    const g = agg.get(key) ?? { date: r.vDate, shed, loom: loom || "-", a: 0, b: 0, c: 0, cp: 0, ppc: 0, rej: 0, total: 0 };
    g.a += r.a ?? 0;
    g.b += r.b ?? 0;
    g.c += r.c ?? 0;
    g.cp += r.cp ?? 0;
    g.ppc += r.ppc ?? 0;
    g.rej += r.rej ?? 0;
    g.total += r.total ?? 0;
    agg.set(key, g);
  }
  const rows = Array.from(agg.values()).sort(
    (x, y) => x.date.localeCompare(y.date) || x.shed.localeCompare(y.shed) || x.loom.localeCompare(y.loom),
  );

  const totA = rows.reduce((s, r) => s + r.a, 0);
  const totB = rows.reduce((s, r) => s + r.b, 0);
  const totC = rows.reduce((s, r) => s + r.c, 0);
  const totCP = rows.reduce((s, r) => s + r.cp, 0);
  const totPPC = rows.reduce((s, r) => s + r.ppc, 0);
  const totRej = rows.reduce((s, r) => s + r.rej, 0);
  const totTot = rows.reduce((s, r) => s + r.total, 0);

  const excelRows = rows.map((r) => ({
    date: r.date,
    shed: r.shed,
    loom: String(r.loom),
    a: Math.round(r.a),
    b: Math.round(r.b),
    c: Math.round(r.c),
    cp: Math.round(r.cp),
    ppc: Math.round(r.ppc),
    rej: Math.round(r.rej),
    total: Math.round(r.total),
  }));

  return (
    <Shell active="w-daily-folding">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Daily Folding</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} rows &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "date", label: "Date" },
                { key: "shed", label: "Shed" },
                { key: "loom", label: "Loom" },
                { key: "a", label: "A" },
                { key: "b", label: "B" },
                { key: "c", label: "C" },
                { key: "cp", label: "CP" },
                { key: "ppc", label: "PPC" },
                { key: "rej", label: "Rej" },
                { key: "total", label: "Total" },
              ]}
              filename="daily-folding"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Daily Folding</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
            {shedQ ? ` · Shed: ${shedQ}` : ""}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">From</label>
            <DateBox name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <DateBox name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Shed</label>
            <input
              type="text"
              name="shed"
              defaultValue={shedQ}
              className="input-box mono"
              placeholder="Shed no"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/daily-folding" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totA)}</div>
            <div className="stat-label">Grade A</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totB)}</div>
            <div className="stat-label">Grade B</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totRej)}</div>
            <div className="stat-label">Rejection</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totTot)}</div>
            <div className="stat-label">Total Folded</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Shed</th>
                <th>Loom</th>
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
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
                    No data
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.date}</td>
                    <td>{r.shed}</td>
                    <td className="mono">{r.loom}</td>
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
                  <td colSpan={3}>GRAND TOTAL</td>
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
