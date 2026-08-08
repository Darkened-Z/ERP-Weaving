import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function WarpedBeamPage() {
  const rows = await db
    .select()
    .from(schema.beamTransactions)
    .where(sql`trans_type = 'WARPED_RECV'`)
    .orderBy(sql`trans_date DESC`);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const totalEnds = rows.reduce((s, r) => s + (r.ends ?? 0), 0);
  const totalWeight = rows.reduce((s, r) => s + (r.weight ?? 0), 0);

  return (
    <Shell active="warped-beam">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Warped Beam Receiving</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} records
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Total Received</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalEnds)}</div>
            <div className="stat-label">Total Ends</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalWeight)}</div>
            <div className="stat-label">Total Weight (Kg)</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>No.</th>
              <th>Beam No.</th>
              <th>Party</th>
              <th>Yarn Count</th>
              <th className="text-right">Ends</th>
              <th className="text-right">Length (m)</th>
              <th className="text-right">Weight (Kg)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[13px]">{r.transDate}</td>
                <td className="mono font-bold">{r.transNo}</td>
                <td className="mono text-[13px]">{r.beamNo ?? "-"}</td>
                <td className="text-[13px]">{r.party ?? "-"}</td>
                <td className="mono text-[13px]">{r.yarnCount ?? "-"}</td>
                <td className="text-right mono">{r.ends != null ? formatNum(r.ends) : "-"}</td>
                <td className="text-right mono">{r.length != null ? formatNum(r.length) : "-"}</td>
                <td className="text-right mono">{r.weight != null ? formatNum(r.weight) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </Shell>
  );
}
