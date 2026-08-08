import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function YarnTransferPage() {
  const rows = await db
    .select()
    .from(schema.yarnTransactions)
    .where(sql`trans_type = 'TRANSFER'`)
    .orderBy(sql`trans_date DESC`);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const totalBags = rows.reduce((s, r) => s + (r.bags ?? 0), 0);
  const totalWeight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);

  return (
    <Shell active="yarn-transfer">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Yarn Internal Transfer</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} transfers
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Total Transfers</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalBags)}</div>
            <div className="stat-label">Total Bags</div>
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
              <th>Yarn Count</th>
              <th className="text-right">Bags</th>
              <th className="text-right">Weight (Kg)</th>
              <th>From</th>
              <th>To</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[13px]">{r.transDate}</td>
                <td className="mono font-bold">{r.transNo}</td>
                <td className="mono text-[13px]">{r.yarnCount ?? "-"}</td>
                <td className="text-right mono">{r.bags != null ? formatNum(r.bags) : "-"}</td>
                <td className="text-right mono">{r.weightKg != null ? formatNum(r.weightKg) : "-"}</td>
                <td className="text-[13px]">{r.fromLocation ?? "-"}</td>
                <td className="text-[13px]">{r.toLocation ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </Shell>
  );
}
