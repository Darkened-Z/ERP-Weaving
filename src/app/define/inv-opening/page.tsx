import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function InventoryOpeningPage() {
  const rows = await db
    .select()
    .from(schema.inventoryOpening)
    .orderBy(schema.inventoryOpening.itemType, schema.inventoryOpening.itemCode);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const totalAmount = rows.reduce((s, r) => s + (r.openingAmount ?? 0), 0);
  const types = [...new Set(rows.map((r) => r.itemType))];

  return (
    <Shell active="inv-opening">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Inventory Opening</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} opening entries &middot; FY 2022
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Items</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{types.length}</div>
            <div className="stat-label">Categories</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalAmount)}</div>
            <div className="stat-label">Total Value</div>
          </div>
        </div>

        {types.map((type) => {
          const items = rows.filter((r) => r.itemType === type);
          const typeTotal = items.reduce((s, r) => s + (r.openingAmount ?? 0), 0);
          return (
            <div key={type} className="mb-8">
              <div className="flex items-baseline justify-between mb-3">
                <div className="section-title">{type}</div>
                <span className="mono text-[13px] text-[var(--muted)]">
                  {formatNum(typeTotal)}
                </span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th className="text-right">Qty</th>
                    <th>Unit</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Amount</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td className="mono font-bold">{r.itemCode}</td>
                      <td className="text-[13px]">{r.description}</td>
                      <td className="text-right mono">{formatNum(r.openingQty)}</td>
                      <td className="text-[12px]">{r.unit}</td>
                      <td className="text-right mono">{formatNum(r.openingRate)}</td>
                      <td className="text-right mono font-bold">{formatNum(r.openingAmount)}</td>
                      <td className="text-[13px] text-[var(--muted)]">{r.location ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
