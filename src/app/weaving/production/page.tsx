import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam || new Date().toISOString().split("T")[0];

  const rows = await db
    .select()
    .from(schema.dailyProduction)
    .where(eq(schema.dailyProduction.productionDate, date))
    .orderBy(schema.dailyProduction.shed, schema.dailyProduction.loomNo);

  const totalMeters = rows.reduce((s, r) => s + (r.meters ?? 0), 0);
  const totalPicks = rows.reduce((s, r) => s + (r.picks ?? 0), 0);
  const totalGradeA = rows.reduce((s, r) => s + (r.gradeA ?? 0), 0);
  const totalGradeB = rows.reduce((s, r) => s + (r.gradeB ?? 0), 0);
  const totalRej = rows.reduce((s, r) => s + (r.rejection ?? 0), 0);
  const avgEff = rows.length
    ? rows.reduce((s, r) => s + (r.efficiency ?? 0), 0) / rows.length
    : 0;

  const pctA = totalMeters ? ((totalGradeA / totalMeters) * 100).toFixed(1) : "0.0";
  const pctB = totalMeters ? ((totalGradeB / totalMeters) * 100).toFixed(1) : "0.0";
  const pctRej = totalMeters ? ((totalRej / totalMeters) * 100).toFixed(1) : "0.0";

  const formatNum = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  return (
    <Shell active="production">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">Daily Production</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} entries for {date}
            </p>
          </div>
          <form className="flex items-center gap-3">
            <label className="label">Date</label>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="input-box mono text-[13px] w-44"
            />
            <button type="submit" className="btn btn-sm">Go</button>
          </form>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-5">
            <div className="stat-value">{formatNum(totalMeters)}</div>
            <div className="stat-label">Total Meters</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{formatNum(totalPicks)}</div>
            <div className="stat-label">Total Picks</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{avgEff.toFixed(1)}%</div>
            <div className="stat-label">Avg Efficiency</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{pctA}%</div>
            <div className="stat-label">Grade A</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{pctB}%</div>
            <div className="stat-label">Grade B</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{pctRej}%</div>
            <div className="stat-label">Rejection</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Loom</th>
              <th>Shed</th>
              <th>Shift</th>
              <th>Contract</th>
              <th>Grey Code</th>
              <th className="text-right">Meters</th>
              <th className="text-right">Grade A</th>
              <th className="text-right">Grade B</th>
              <th className="text-right">Rej</th>
              <th className="text-right">RPM</th>
              <th className="text-right">Eff%</th>
              <th>Weaver</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono font-bold">{r.loomNo}</td>
                <td>{r.shed}</td>
                <td>{r.shift}</td>
                <td className="mono text-[13px]">{r.contractNo}</td>
                <td className="mono text-[13px]">{r.greyCode}</td>
                <td className="text-right mono">{formatNum(r.meters)}</td>
                <td className="text-right mono">{formatNum(r.gradeA)}</td>
                <td className="text-right mono">{formatNum(r.gradeB)}</td>
                <td className="text-right mono">{formatNum(r.rejection)}</td>
                <td className="text-right mono">{r.rpm ?? "-"}</td>
                <td className="text-right mono">{r.efficiency != null ? `${r.efficiency.toFixed(1)}` : "-"}</td>
                <td className="text-[var(--muted)]">{r.weaverName}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                <td colSpan={5} className="text-[11px] uppercase tracking-[0.08em]">Total</td>
                <td className="text-right mono">{formatNum(totalMeters)}</td>
                <td className="text-right mono">{formatNum(totalGradeA)}</td>
                <td className="text-right mono">{formatNum(totalGradeB)}</td>
                <td className="text-right mono">{formatNum(totalRej)}</td>
                <td></td>
                <td className="text-right mono">{avgEff.toFixed(1)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </Shell>
  );
}
