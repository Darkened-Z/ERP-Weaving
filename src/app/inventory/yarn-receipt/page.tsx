import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function YarnReceiptPage() {
  const rows = await db
    .select()
    .from(schema.yarnTransactions)
    .where(sql`trans_type IN ('RECEIPT','RETURN')`)
    .orderBy(sql`trans_date DESC`);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const receipts = rows.filter((r) => r.transType === "RECEIPT");
  const returns = rows.filter((r) => r.transType === "RETURN");
  const totalWeight = rows.reduce((s, r) => s + (r.weightKg ?? 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <Shell active="yarn-receipt">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Yarn Receipt / Return</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} transactions
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{receipts.length}</div>
            <div className="stat-label">Receipts</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{returns.length}</div>
            <div className="stat-label">Returns</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalWeight)}</div>
            <div className="stat-label">Total Weight (Kg)</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalAmount)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>No.</th>
              <th>Type</th>
              <th>Party</th>
              <th>Yarn Count</th>
              <th className="text-right">Bags</th>
              <th className="text-right">Weight (Kg)</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
              <th>Vehicle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[13px]">{r.transDate}</td>
                <td className="mono font-bold">{r.transNo}</td>
                <td>
                  <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                    {r.transType}
                  </span>
                </td>
                <td className="text-[13px]">{r.party ?? "-"}</td>
                <td className="mono text-[13px]">{r.yarnCount ?? "-"}</td>
                <td className="text-right mono">{r.bags != null ? formatNum(r.bags) : "-"}</td>
                <td className="text-right mono">{r.weightKg != null ? formatNum(r.weightKg) : "-"}</td>
                <td className="text-right mono">{r.rate != null ? formatNum(r.rate) : "-"}</td>
                <td className="text-right mono">{r.amount != null ? formatNum(r.amount) : "-"}</td>
                <td className="mono text-[13px]">{r.vehicleNo ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </Shell>
  );
}
