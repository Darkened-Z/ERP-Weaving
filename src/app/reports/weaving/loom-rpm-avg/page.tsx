import { Fragment } from "react";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { fmt, sixMonthsAgo, todayIso } from "../../_shared";

export const dynamic = "force-dynamic";

const SORTS = {
  shed: (a: Row, b: Row) => (a.shed ?? "").localeCompare(b.shed ?? "") || a.loomNo - b.loomNo,
  loom: (a: Row, b: Row) => a.loomNo - b.loomNo,
  rpm: (a: Row, b: Row) => (b.avgRpm ?? 0) - (a.avgRpm ?? 0),
  runs: (a: Row, b: Row) => b.runs - a.runs,
} as const;

type SortKey = keyof typeof SORTS;

type Row = {
  loomNo: number;
  shed: string | null;
  weaverName: string | null;
  targetRpm: number | null;
  actRpm: number | null;
  avgRpm: number | null;
  runs: number;
  totalProd: number;
};

export default async function LoomRpmAvgPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; sort?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const sort = (p.sort?.trim() as SortKey) || "shed";

  const looms = await db
    .select({
      loomNo: schema.looms.loomNo,
      shed: schema.looms.shed,
      weaverName: schema.looms.weaverName,
      rpm: schema.looms.rpm,
      actRpm: schema.looms.actRpm,
    })
    .from(schema.looms);

  // Legacy dailyProduction table has rpm — average per loom in range if present.
  const rpmAgg = await db
    .select({
      loomNo: schema.dailyProduction.loomNo,
      avgRpm: sql<number>`avg(${schema.dailyProduction.rpm})`,
      runs: sql<number>`count(*)`,
    })
    .from(schema.dailyProduction)
    .where(
      and(
        gte(schema.dailyProduction.productionDate, from),
        lte(schema.dailyProduction.productionDate, to),
      ),
    )
    .groupBy(schema.dailyProduction.loomNo);
  const legacyMap = new Map(rpmAgg.map((r) => [r.loomNo, r]));

  // intDailyProduction has no per-loom RPM column; join via beams.beamNo → beams.loomNo
  // to count production activity per loom in the range.
  const intAgg = await db
    .select({
      loomNo: schema.beams.loomNo,
      runs: sql<number>`count(distinct ${schema.intDailyProduction.id})`,
      totalProd: sql<number>`coalesce(sum(${schema.intDailyProductionSet.totalCount}), 0)`,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id),
    )
    .innerJoin(
      schema.beams,
      eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo),
    )
    .where(
      and(
        gte(schema.intDailyProduction.vDate, from),
        lte(schema.intDailyProduction.vDate, to),
      ),
    )
    .groupBy(schema.beams.loomNo);
  const intMap = new Map(intAgg.map((r) => [r.loomNo ?? 0, r]));

  const rows: Row[] = looms.map((l) => {
    const legacy = legacyMap.get(l.loomNo);
    const int = intMap.get(l.loomNo);
    const legacyAvg = legacy?.avgRpm ?? null;
    return {
      loomNo: l.loomNo,
      shed: l.shed ?? null,
      weaverName: l.weaverName ?? null,
      targetRpm: l.rpm ?? null,
      actRpm: l.actRpm ?? null,
      avgRpm: legacyAvg ?? l.actRpm ?? null,
      runs: (legacy?.runs ?? 0) + (int?.runs ?? 0),
      totalProd: int?.totalProd ?? 0,
    };
  });

  rows.sort(SORTS[sort] ?? SORTS.shed);

  // group by shed for display
  const byShed = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.shed ?? "(no shed)";
    const arr = byShed.get(k) ?? [];
    arr.push(r);
    byShed.set(k, arr);
  }
  const sheds = [...byShed.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const totalRpm = rows.reduce((s, r) => s + (r.avgRpm ?? 0), 0);
  const overallAvg = rows.length ? totalRpm / rows.length : 0;

  const excelRows = rows.map((r) => ({
    shed: r.shed ?? "",
    loomNo: r.loomNo,
    weaverName: r.weaverName ?? "",
    targetRpm: r.targetRpm ?? 0,
    actRpm: r.actRpm ?? 0,
    avgRpm: Math.round(r.avgRpm ?? 0),
    runs: r.runs,
    totalProd: Math.round(r.totalProd),
  }));

  const linkSort = (key: SortKey) =>
    `?from=${from}&to=${to}&sort=${key}`;

  return (
    <Shell active="w-loom-rpm-avg">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Loom RPM Average</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} looms &middot; {from} to {to} &middot; overall avg {fmt(overallAvg)}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "shed", label: "Shed" },
                { key: "loomNo", label: "Loom" },
                { key: "weaverName", label: "Weaver" },
                { key: "targetRpm", label: "Target RPM" },
                { key: "actRpm", label: "Loom Act RPM" },
                { key: "avgRpm", label: "Avg RPM" },
                { key: "runs", label: "Prod Runs" },
                { key: "totalProd", label: "Total Prod" },
              ]}
              filename="loom-rpm-avg"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Loom RPM Average</h1>
          <div className="mono text-[12px] mt-2">
            {from} to {to}
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
            <label className="label block mb-1">Sort</label>
            <select name="sort" defaultValue={sort} className="input-box mono">
              <option value="shed">Shed / Loom</option>
              <option value="loom">Loom No</option>
              <option value="rpm">Avg RPM (desc)</option>
              <option value="runs">Prod Runs (desc)</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/loom-rpm-avg" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Shed</th>
                <th>
                  <a href={linkSort("loom")}>Loom</a>
                </th>
                <th>Weaver</th>
                <th className="text-right">Target RPM</th>
                <th className="text-right">Loom Act RPM</th>
                <th className="text-right">
                  <a href={linkSort("rpm")}>Avg RPM</a>
                </th>
                <th className="text-right">
                  <a href={linkSort("runs")}>Prod Runs</a>
                </th>
                <th className="text-right">Total Prod</th>
              </tr>
            </thead>
            <tbody>
              {sheds.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-8">
                    No looms
                  </td>
                </tr>
              ) : (
                sheds.map(([shed, srows]) => {
                  const shedAvg =
                    srows.reduce((s, r) => s + (r.avgRpm ?? 0), 0) / (srows.length || 1);
                  return (
                    <Fragment key={shed}>
                      <tr style={{ background: "#f4f4f4" }}>
                        <td colSpan={8} className="font-bold">
                          {shed} — {srows.length} looms · avg {fmt(shedAvg)}
                        </td>
                      </tr>
                      {srows.map((r) => (
                        <tr key={r.loomNo}>
                          <td className="mono">{r.shed ?? "-"}</td>
                          <td className="mono font-bold">{r.loomNo}</td>
                          <td>{r.weaverName ?? "-"}</td>
                          <td className="mono text-right">{r.targetRpm ?? "-"}</td>
                          <td className="mono text-right">{r.actRpm ?? "-"}</td>
                          <td className="mono text-right font-bold">{fmt(r.avgRpm ?? 0)}</td>
                          <td className="mono text-right">{r.runs}</td>
                          <td className="mono text-right">{fmt(r.totalProd)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
