import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");

export default async function PartsPage() {
  const parts = await db
    .select()
    .from(schema.chartParts)
    .orderBy(schema.chartParts.category, schema.chartParts.code);

  const total = parts.length;
  const categories = new Set(parts.map((p) => p.category)).size;
  const belowMin = parts.filter((p) => p.currentStock < p.minStock).length;

  const grouped = parts.reduce<Record<string, (typeof parts)[number][]>>(
    (acc, p) => {
      const cat = p.category ?? "UNCATEGORIZED";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    },
    {}
  );

  return (
    <Shell active="parts">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Parts Catalog{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Parts</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{categories}</div>
            <div className="stat-label">Categories</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{belowMin}</div>
            <div className="stat-label">Below Minimum</div>
          </div>
        </div>

        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-8">
            <div className="section-title">{category}</div>
            <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th className="text-right">Min Stock</th>
                  <th className="text-right">Current Stock</th>
                  <th className="text-right">Avg Cost</th>
                  <th>Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr
                    key={p.id}
                    style={
                      p.currentStock < p.minStock
                        ? { borderLeft: "2px solid var(--danger)" }
                        : undefined
                    }
                  >
                    <td className="mono text-[13px]">{p.code}</td>
                    <td>{p.description}</td>
                    <td className="mono text-[13px]">{p.unit}</td>
                    <td className="mono text-[13px] text-right">
                      {fmt.format(p.minStock)}
                    </td>
                    <td className="mono text-[13px] text-right">
                      {fmt.format(p.currentStock)}
                    </td>
                    <td className="mono text-[13px] text-right">
                      {fmt.format(Math.round(p.avgCost))}
                    </td>
                    <td className="mono text-[13px]">
                      {p.lastPurchaseDate ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
