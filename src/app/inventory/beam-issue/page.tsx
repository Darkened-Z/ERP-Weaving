import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function BeamIssuePage() {
  const rows = await db
    .select()
    .from(schema.beamTransactions)
    .where(sql`trans_type = 'EMPTY_ISSUE'`)
    .orderBy(sql`trans_date DESC`);

  return (
    <Shell active="beam-issue">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Empty Beam Issue</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} records
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Total Issued</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>No.</th>
              <th>Beam No.</th>
              <th>Yarn Count</th>
              <th>From</th>
              <th>To</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[13px]">{r.transDate}</td>
                <td className="mono font-bold">{r.transNo}</td>
                <td className="mono text-[13px]">{r.beamNo ?? "-"}</td>
                <td className="mono text-[13px]">{r.yarnCount ?? "-"}</td>
                <td className="text-[13px]">{r.fromLocation ?? "-"}</td>
                <td className="text-[13px]">{r.toLocation ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
