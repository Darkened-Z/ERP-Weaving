import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HoursSchedulePage() {
  const rows = await db
    .select()
    .from(schema.productionHours)
    .orderBy(sql`schedule_date DESC, shed, shift`)
    .limit(40);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const avgLooms =
    rows.length > 0
      ? rows.reduce((s, r) => s + (r.loomsRunning ?? 0), 0) / rows.length
      : 0;

  return (
    <Shell active="hours-schedule">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Production Hours Schedule</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            Showing latest {rows.length} records
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Total Records</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(avgLooms)}</div>
            <div className="stat-label">Avg Looms Running</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Shed</th>
              <th>Shift</th>
              <th>Start</th>
              <th>End</th>
              <th className="text-right">Hours</th>
              <th className="text-right">Looms Running</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[13px]">{r.scheduleDate}</td>
                <td className="text-[13px]">{r.shed}</td>
                <td className="text-[13px]">{r.shift}</td>
                <td className="mono text-[13px]">{r.startTime}</td>
                <td className="mono text-[13px]">{r.endTime}</td>
                <td className="text-right mono">{r.hours}</td>
                <td className="text-right mono">{r.loomsRunning ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
