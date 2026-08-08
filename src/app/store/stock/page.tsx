import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  const allParts = await db
    .select()
    .from(schema.chartParts)
    .orderBy(schema.chartParts.category, schema.chartParts.code);

  const categories = [...new Set(allParts.map((p) => p.category))].filter(
    Boolean
  ) as string[];

  const parts = category
    ? allParts.filter((p) => p.category === category)
    : allParts;

  const totalValue = parts.reduce(
    (sum, p) => sum + p.currentStock * p.avgCost,
    0
  );

  return (
    <Shell active="stock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">Stock Inquiry</h1>
        </div>

        <div className="flex gap-px bg-black border border-black mb-8 overflow-x-auto">
          <a
            href="/store/stock"
            className="bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
            style={
              !category
                ? { background: "#000", color: "#fff" }
                : undefined
            }
          >
            All
          </a>
          {categories.map((cat) => (
            <a
              key={cat}
              href={`/store/stock?category=${encodeURIComponent(cat)}`}
              className="bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
              style={
                category === cat
                  ? { background: "#000", color: "#fff" }
                  : undefined
              }
            >
              {cat}
            </a>
          ))}
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Category</th>
              <th>Unit</th>
              <th className="text-right">Current Stock</th>
              <th className="text-right">Avg Cost</th>
              <th className="text-right">Stock Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id}>
                <td className="mono text-[13px]">{p.code}</td>
                <td>{p.description}</td>
                <td className="text-[13px]">{p.category}</td>
                <td className="mono text-[13px]">{p.unit}</td>
                <td className="mono text-[13px] text-right">
                  {fmt.format(p.currentStock)}
                </td>
                <td className="mono text-[13px] text-right">
                  {fmt.format(Math.round(p.avgCost))}
                </td>
                <td className="mono text-[13px] text-right">
                  {fmt.format(Math.round(p.currentStock * p.avgCost))}
                </td>
                <td>
                  <span
                    className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase"
                    style={{
                      background: p.status === "A" ? "#000" : "#999",
                      color: "#fff",
                      borderColor: p.status === "A" ? "#000" : "#999",
                    }}
                  >
                    {p.status === "A" ? "ACTIVE" : "INACTIVE"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="text-right font-semibold text-[13px]">
                Total Stock Value
              </td>
              <td className="mono text-[13px] text-right font-bold">
                {fmt.format(Math.round(totalValue))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Shell>
  );
}
