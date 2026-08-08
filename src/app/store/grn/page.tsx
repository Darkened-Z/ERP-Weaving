import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");

export default async function GrnPage() {
  const rows = await db
    .select()
    .from(schema.storeGrn)
    .orderBy(sql`grn_date DESC`);

  const total = rows.length;
  const totalItems = rows.reduce((s, r) => s + (r.itemCount ?? 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);

  return (
    <Shell active="grn">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Goods Received Notes{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total GRNs</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{fmt.format(totalItems)}</div>
            <div className="stat-label">Total Items</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{fmt.format(Math.round(totalAmount))}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>GRN No.</th>
              <th>Supplier</th>
              <th>Invoice No.</th>
              <th className="text-right">Items</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-[var(--muted)]">
                  No GRNs found
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[13px]">{r.grnDate}</td>
                  <td className="mono text-[13px]">{r.grnNo}</td>
                  <td>{r.supplier}</td>
                  <td className="mono text-[13px]">{r.invoiceNo ?? ""}</td>
                  <td className="mono text-[13px] text-right">
                    {r.itemCount ?? 0}
                  </td>
                  <td className="mono text-[13px] text-right">
                    {fmt.format(Math.round(r.totalAmount ?? 0))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </Shell>
  );
}
