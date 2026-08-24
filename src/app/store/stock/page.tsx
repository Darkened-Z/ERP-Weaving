import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");
const r2 = (n: number) => Math.round(n * 100) / 100;

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; nz?: string; asOf?: string }>;
}) {
  const { category, nz, asOf } = await searchParams;
  const hideZero = nz === "1";
  const asOfDate = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : undefined;

  const allParts = await db
    .select()
    .from(schema.chartParts)
    .orderBy(schema.chartParts.category, schema.chartParts.code);

  const categories = [...new Set(allParts.map((p) => p.category))].filter(
    Boolean
  ) as string[];

  let adjust: Map<string, number> | null = null;
  if (asOfDate) {
    adjust = new Map();
    const grnAfter = await db
      .select({
        partCode: schema.storeGrnDetail.partCode,
        q: sql<number>`coalesce(sum(${schema.storeGrnDetail.qty}), 0)`,
      })
      .from(schema.storeGrnDetail)
      .innerJoin(
        schema.storeGrn,
        eq(schema.storeGrnDetail.grnId, schema.storeGrn.id)
      )
      .where(sql`${schema.storeGrn.grnDate} > ${asOfDate}`)
      .groupBy(schema.storeGrnDetail.partCode);
    for (const g of grnAfter)
      adjust.set(g.partCode, (adjust.get(g.partCode) ?? 0) - g.q);

    const issuedAfter = await db
      .select({
        partCode: schema.storeDemandDetail.partCode,
        q: sql<number>`coalesce(sum(${schema.storeDemandDetail.qty}), 0)`,
      })
      .from(schema.storeDemandDetail)
      .innerJoin(
        schema.storeDemands,
        eq(schema.storeDemandDetail.demandId, schema.storeDemands.id)
      )
      .where(sql`${schema.storeDemands.demandDate} > ${asOfDate}`)
      .groupBy(schema.storeDemandDetail.partCode);
    for (const d of issuedAfter)
      adjust.set(d.partCode, (adjust.get(d.partCode) ?? 0) + d.q);

    const returnedAfter = await db
      .select({
        partCode: schema.storeReturnDetail.partCode,
        q: sql<number>`coalesce(sum(${schema.storeReturnDetail.qty}), 0)`,
      })
      .from(schema.storeReturnDetail)
      .innerJoin(
        schema.storeReturns,
        eq(schema.storeReturnDetail.returnId, schema.storeReturns.id)
      )
      .where(sql`${schema.storeReturns.returnDate} > ${asOfDate}`)
      .groupBy(schema.storeReturnDetail.partCode);
    for (const r of returnedAfter)
      adjust.set(r.partCode, (adjust.get(r.partCode) ?? 0) - r.q);
  }

  const stockOf = (p: (typeof allParts)[number]) =>
    r2(p.currentStock + (adjust?.get(p.code) ?? 0));

  const parts = allParts
    .filter((p) => (category ? p.category === category : true))
    .filter((p) => (hideZero ? stockOf(p) !== 0 : true));

  const totalValue = parts.reduce((sum, p) => sum + stockOf(p) * p.avgCost, 0);

  const qs = (over: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      category,
      nz,
      asOf: asOfDate,
      ...over,
    };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return "/store/stock" + (s ? "?" + s : "");
  };

  return (
    <Shell active="stock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">Stock Inquiry</h1>
          <div className="flex items-end gap-3 flex-wrap">
            <form method="GET" action="/store/stock" className="flex items-end gap-2">
              {category && <input type="hidden" name="category" value={category} />}
              {hideZero && <input type="hidden" name="nz" value="1" />}
              <div>
                <label className="label block mb-1">As Of</label>
                <input
                  name="asOf"
                  type="date"
                  className="input-box mono"
                  defaultValue={asOfDate ?? ""}
                />
              </div>
              <button type="submit" className="btn btn-sm">
                Go
              </button>
              {asOfDate && (
                <a href={qs({ asOf: undefined })} className="btn btn-outline btn-sm">
                  Today
                </a>
              )}
            </form>
            <a
              href={qs({ nz: hideZero ? undefined : "1" })}
              className="btn btn-outline btn-sm"
              style={hideZero ? { background: "#000", color: "#fff" } : undefined}
            >
              Hide Zero Stock
            </a>
          </div>
        </div>

        {asOfDate && (
          <div className="border border-black px-3 py-2 mb-6 text-[13px]">
            Showing stock as of <span className="mono font-bold">{asOfDate}</span>{" "}
            (current stock reverse-walked over later GRNs, issues and returns).
            Stock value uses the current average cost.
          </div>
        )}

        <div className="flex gap-px bg-black border border-black mb-8 overflow-x-auto">
          <a
            href={qs({ category: undefined })}
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
              href={qs({ category: cat })}
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

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Category</th>
              <th>Unit</th>
              <th className="text-right">
                {asOfDate ? `Stock @ ${asOfDate}` : "Current Stock"}
              </th>
              <th className="text-right">Avg Cost</th>
              <th className="text-right">Stock Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {parts.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-[var(--muted)]">
                  No parts match the current filters
                </td>
              </tr>
            )}
            {parts.map((p) => {
              const stock = stockOf(p);
              return (
                <tr key={p.id}>
                  <td className="mono text-[13px]">{p.code}</td>
                  <td>{p.description}</td>
                  <td className="text-[13px]">{p.category}</td>
                  <td className="mono text-[13px]">{p.unit}</td>
                  <td className="mono text-[13px] text-right">
                    {fmt.format(stock)}
                  </td>
                  <td className="mono text-[13px] text-right">
                    {fmt.format(Math.round(p.avgCost))}
                  </td>
                  <td className="mono text-[13px] text-right">
                    {fmt.format(Math.round(stock * p.avgCost))}
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
              );
            })}
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
      </div>
    </Shell>
  );
}
