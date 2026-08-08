import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function PakiParchiPage() {
  const rows = await db
    .select()
    .from(schema.greyPakiParchi)
    .orderBy(sql`pp_date DESC`);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const totalThan = rows.reduce((s, r) => s + (r.qtyThan ?? 0), 0);
  const totalMtrs = rows.reduce((s, r) => s + (r.qtyMtrs ?? 0), 0);
  const totalNet = rows.reduce((s, r) => s + (r.qtyMtrsNet ?? 0), 0);
  const totalAmt = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <Shell active="paki-parchi">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Grey Paki Parchi</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} delivery receipts
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Receipts</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalThan)}</div>
            <div className="stat-label">Total Than</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalNet)}</div>
            <div className="stat-label">Net Meters</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalAmt)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>PP No.</th>
                <th>Party</th>
                <th>Contract</th>
                <th className="text-right">Than</th>
                <th className="text-right">Meters</th>
                <th className="text-right">Net Mtrs</th>
                <th className="text-right">Pick</th>
                <th className="text-right">Width</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[13px]">{r.ppDate}</td>
                  <td className="mono font-bold">{r.ppNo}</td>
                  <td className="text-[13px]">{r.party}</td>
                  <td className="mono text-[13px]">{r.contractNo ?? "-"}</td>
                  <td className="text-right mono">{r.qtyThan ?? "-"}</td>
                  <td className="text-right mono">{r.qtyMtrs != null ? formatNum(r.qtyMtrs) : "-"}</td>
                  <td className="text-right mono">{r.qtyMtrsNet != null ? formatNum(r.qtyMtrsNet) : "-"}</td>
                  <td className="text-right mono">{r.greyPick ?? "-"}</td>
                  <td className="text-right mono">{r.greyWidth ?? "-"}</td>
                  <td className="text-right mono">{r.rate ?? "-"}</td>
                  <td className="text-right mono font-bold">{r.amount != null ? formatNum(r.amount) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
