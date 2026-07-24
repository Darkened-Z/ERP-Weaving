import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function KnottingPage() {
  const rows = await db
    .select()
    .from(schema.knottingTransactions)
    .orderBy(sql`trans_date DESC`);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <Shell active="knotting">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Knotting / Sarning / Maroori</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} records
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Total Records</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalAmount)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>No.</th>
              <th>Contract</th>
              <th>Beam</th>
              <th>Type</th>
              <th>Weaver</th>
              <th className="text-right">Loom</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[13px]">{r.transDate}</td>
                <td className="mono font-bold">{r.transNo}</td>
                <td className="mono text-[13px]">{r.contractNo ?? "-"}</td>
                <td className="mono text-[13px]">{r.beamNo ?? "-"}</td>
                <td>
                  <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                    {r.transType}
                  </span>
                </td>
                <td className="text-[13px]">{r.weaver ?? "-"}</td>
                <td className="text-right mono">{r.loomNo ?? "-"}</td>
                <td className="text-right mono">{r.rate != null ? formatNum(r.rate) : "-"}</td>
                <td className="text-right mono">{r.amount != null ? formatNum(r.amount) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
