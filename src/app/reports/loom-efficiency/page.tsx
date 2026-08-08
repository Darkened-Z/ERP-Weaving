import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql, and, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

function daysBackFrom(d: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - (n - 1));
  return dt.toISOString().slice(0, 10);
}

export default async function LoomEfficiencyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  let from = params.from;
  let to = params.to;

  if (!to) {
    const [maxRow] = await db
      .select({ d: sql<string>`max(production_date)` })
      .from(schema.dailyProduction);
    to = maxRow?.d ?? undefined;
  }
  if (!from && to) {
    from = daysBackFrom(to, 7);
  }

  const conditions = [];
  if (from) conditions.push(gte(schema.dailyProduction.productionDate, from));
  if (to) conditions.push(lte(schema.dailyProduction.productionDate, to));

  const prodRows = await db
    .select({
      loomNo: schema.dailyProduction.loomNo,
      meters: sql<number>`coalesce(sum(meters), 0)`,
      avgEff: sql<number | null>`avg(efficiency)`,
      avgActRpm: sql<number>`coalesce(avg(rpm), 0)`,
      days: sql<number>`count(distinct production_date)`,
    })
    .from(schema.dailyProduction)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(schema.dailyProduction.loomNo);

  const looms = await db.select().from(schema.looms);
  const loomMap = new Map(looms.map((l) => [l.loomNo, l]));

  const activeRows = prodRows.map((p) => {
    const l = loomMap.get(p.loomNo);
    const targetRpm = l?.rpm ?? 0;
    const utilization = targetRpm > 0 ? ((p.avgActRpm ?? 0) / targetRpm) * 100 : 0;
    return {
      loomNo: p.loomNo,
      shed: l?.shed ?? "-",
      weaver: l?.weaverName ?? "-",
      days: p.days ?? 0,
      meters: p.meters ?? 0,
      avgEff: p.avgEff as number | null,
      targetRpm,
      avgActRpm: p.avgActRpm ?? 0,
      utilization,
    };
  });

  const prodLoomNos = new Set(prodRows.map((p) => p.loomNo));
  const idleLooms = looms.filter((l) => !prodLoomNos.has(l.loomNo));
  const idleRows = idleLooms.map((l) => ({
    loomNo: l.loomNo,
    shed: l.shed ?? "-",
    weaver: l.weaverName ?? "-",
    days: 0,
    meters: 0,
    avgEff: null as number | null,
    targetRpm: l.rpm ?? 0,
    avgActRpm: 0,
    utilization: 0,
  }));

  const rows = [...activeRows, ...idleRows].sort(
    (a, b) => (b.avgEff ?? -Infinity) - (a.avgEff ?? -Infinity),
  );
  const idleCount = idleLooms.length;

  const rankedRows = activeRows.filter((r) => r.avgEff !== null).sort(
    (a, b) => (b.avgEff ?? 0) - (a.avgEff ?? 0),
  );
  const top5 = rankedRows.slice(0, 5);
  const bottom5 = rankedRows.length > 5 ? rankedRows.slice(-5).reverse() : [];

  const totalMeters = rows.reduce((s, r) => s + r.meters, 0);
  const nonNullEff = rows.filter((r) => r.avgEff !== null);
  const avgEffOverall =
    nonNullEff.length > 0
      ? nonNullEff.reduce((s, r) => s + (r.avgEff ?? 0), 0) / nonNullEff.length
      : 0;

  return (
    <Shell active="loom-eff">
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="page-title">Loom Efficiency Report</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} looms &middot; {from ?? "-"} to {to ?? "-"}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <aside className="border border-black p-4 h-fit">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold mb-3">
              Filter
            </div>
            <form method="GET" action="" className="space-y-3">
              <div>
                <label className="label block mb-1">From</label>
                <input
                  type="date"
                  name="from"
                  defaultValue={from ?? ""}
                  className="input-box mono"
                />
              </div>
              <div>
                <label className="label block mb-1">To</label>
                <input
                  type="date"
                  name="to"
                  defaultValue={to ?? ""}
                  className="input-box mono"
                />
              </div>
              <button type="submit" className="btn btn-sm w-full justify-center">
                Apply
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-black/20">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                Total Meters
              </div>
              <div className="mono text-xl font-bold">{fmt(totalMeters)}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] mt-3">
                Avg Efficiency
              </div>
              <div className="mono text-xl font-bold">{fmt2(avgEffOverall)}%</div>
            </div>
          </aside>

          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="border border-black">
                <div className="bg-black text-white px-3 py-2 text-[11px] uppercase tracking-[0.12em] font-semibold">
                  Top 5 Looms
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Loom</th>
                      <th>Weaver</th>
                      <th className="text-right">Eff %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center text-[var(--muted)] py-4">
                          No data
                        </td>
                      </tr>
                    ) : (
                      top5.map((r) => (
                        <tr key={r.loomNo}>
                          <td className="mono">#{r.loomNo}</td>
                          <td className="text-[12px]">{r.weaver}</td>
                          <td className="mono text-right font-bold">
                            {r.avgEff === null ? "—" : fmt2(r.avgEff)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border border-black">
                <div className="bg-black text-white px-3 py-2 text-[11px] uppercase tracking-[0.12em] font-semibold">
                  Bottom 5 Looms
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Loom</th>
                      <th>Weaver</th>
                      <th className="text-right">Eff %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bottom5.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center text-[var(--muted)] py-4">
                          No data
                        </td>
                      </tr>
                    ) : (
                      bottom5.map((r) => (
                        <tr key={r.loomNo}>
                          <td className="mono">#{r.loomNo}</td>
                          <td className="text-[12px]">{r.weaver}</td>
                          <td className="mono text-right italic underline">
                            {r.avgEff === null ? "—" : fmt2(r.avgEff)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {idleCount > 0 && (
              <div className="mb-3 text-[12px] text-[var(--muted)] uppercase tracking-[0.1em]">
                {idleCount} looms had no production in this window
              </div>
            )}
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Loom #</th>
                    <th>Shed</th>
                    <th>Weaver</th>
                    <th className="text-right">Days</th>
                    <th className="text-right">Meters</th>
                    <th className="text-right">Avg Eff %</th>
                    <th className="text-right">Target RPM</th>
                    <th className="text-right">Avg RPM</th>
                    <th className="text-right">Utilization %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center text-[var(--muted)] py-8">
                        No production data for selected period
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const eff = r.avgEff;
                      const effClass =
                        eff === null
                          ? ""
                          : eff >= 90
                          ? "font-bold"
                          : eff < 75
                          ? "italic underline"
                          : "";
                      return (
                        <tr key={r.loomNo}>
                          <td className="mono font-bold">#{r.loomNo}</td>
                          <td className="text-[12px]">{r.shed}</td>
                          <td className="text-[13px]">{r.weaver}</td>
                          <td className="mono text-right">{r.days}</td>
                          <td className="mono text-right">{fmt(r.meters)}</td>
                          <td className={`mono text-right ${effClass}`}>
                            {eff === null ? "—" : fmt2(eff)}
                          </td>
                          <td className="mono text-right">{r.targetRpm || "-"}</td>
                          <td className="mono text-right">{fmt(r.avgActRpm)}</td>
                          <td className="mono text-right">
                            {r.targetRpm > 0 ? fmt2(r.utilization) : "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
