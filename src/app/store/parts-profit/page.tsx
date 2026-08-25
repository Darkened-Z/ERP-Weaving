import { Shell } from "@/components/shell";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });

// NOTE: chartParts has no profitPct column in the schema. This page treats
// profit% as a page-scoped query parameter and computes prices on the fly.
// Persisting per-part overrides would require a schema migration:
//   ALTER TABLE chart_parts ADD COLUMN profit_pct REAL;
// Not applied here — see report for details.

export default async function PartsProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ pct?: string; cat?: string }>;
}) {
  const session = await requireSession();
  if (session.roleName !== "ADMIN") {
    redirect("/?error=admin_only");
  }

  const params = await searchParams;
  const globalPctRaw = params.pct?.trim() ?? "";
  const globalPct = globalPctRaw ? parseFloat(globalPctRaw) : 0;
  const validPct = Number.isFinite(globalPct) ? globalPct : 0;
  const cat = params.cat?.trim() ?? "";

  const allParts = await db
    .select()
    .from(schema.chartParts)
    .orderBy(schema.chartParts.category, schema.chartParts.code);

  const categories = [...new Set(allParts.map((p) => p.category).filter(Boolean))] as string[];
  const parts = cat ? allParts.filter((p) => p.category === cat) : allParts;

  const totCost = parts.reduce((s, p) => s + p.avgCost, 0);
  const totMarked = parts.reduce((s, p) => s + p.avgCost * (1 + validPct / 100), 0);

  const qs = (over: Record<string, string | undefined>) => {
    const merged = { pct: globalPctRaw || undefined, cat: cat || undefined, ...over };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return "/store/parts-profit" + (s ? "?" + s : "");
  };

  return (
    <Shell active="parts-profit">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Parts Profit Change</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Apply a margin% across the catalog and preview the resulting
              sale prices. {parts.length} parts shown.
            </p>
          </div>
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold text-[var(--muted)]">
            ADMIN &middot; {session.login}
          </div>
        </div>

        <div className="border-2 border-black bg-gray-50 p-4 mb-6 text-[12px] leading-relaxed">
          <div className="mono font-semibold uppercase tracking-wider mb-1">
            Persistence Note
          </div>
          Profit% is applied at display time only. A per-part
          <span className="mono"> profit_pct </span>
          column is not yet in the schema. To persist per-row overrides,
          add <span className="mono">ALTER TABLE chart_parts ADD COLUMN profit_pct REAL</span>{" "}
          and swap this form for a server action that writes back.
        </div>

        <form
          method="GET"
          action="/store/parts-profit"
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4"
        >
          <div>
            <label className="label block mb-1">Global Profit %</label>
            <input
              type="number"
              step="any"
              name="pct"
              className="input-box mono"
              defaultValue={globalPctRaw}
              placeholder="e.g. 15"
            />
          </div>
          <div>
            <label className="label block mb-1">Category</label>
            <select name="cat" defaultValue={cat} className="input-box">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-sm">
              Update
            </button>
            <a href="/store/parts-profit" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{parts.length}</div>
            <div className="stat-label">Parts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt.format(validPct)}%</div>
            <div className="stat-label">Applied Margin</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt.format(Math.round(totCost))}</div>
            <div className="stat-label">Total Cost</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt.format(Math.round(totMarked))}</div>
            <div className="stat-label">Total @ New Price</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Category</th>
                <th>Unit</th>
                <th className="text-right">Avg Cost</th>
                <th className="text-right" style={{ width: 120 }}>
                  Profit %
                </th>
                <th className="text-right">New Price</th>
                <th className="text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {parts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-6">
                    No parts match the current filter.
                  </td>
                </tr>
              )}
              {parts.map((p) => {
                const rowPct = validPct;
                const newPrice = p.avgCost * (1 + rowPct / 100);
                const delta = newPrice - p.avgCost;
                return (
                  <tr key={p.id}>
                    <td className="mono text-[13px]">{p.code}</td>
                    <td>{p.description}</td>
                    <td className="text-[13px]">{p.category ?? "-"}</td>
                    <td className="mono text-[13px]">{p.unit}</td>
                    <td className="mono text-[13px] text-right">
                      {fmt.format(Math.round(p.avgCost * 100) / 100)}
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="any"
                        defaultValue={rowPct || ""}
                        placeholder={String(validPct)}
                        className="input-box mono text-right text-[13px]"
                        disabled
                        title="Per-part override requires schema migration"
                      />
                    </td>
                    <td className="mono text-[13px] text-right font-bold">
                      {fmt.format(Math.round(newPrice * 100) / 100)}
                    </td>
                    <td className="mono text-[13px] text-right">
                      {delta >= 0 ? "+" : ""}
                      {fmt.format(Math.round(delta * 100) / 100)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {parts.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={4}>Total</td>
                  <td className="mono text-right">
                    {fmt.format(Math.round(totCost))}
                  </td>
                  <td className="text-right">{fmt.format(validPct)}%</td>
                  <td className="mono text-right">
                    {fmt.format(Math.round(totMarked))}
                  </td>
                  <td className="mono text-right">
                    {fmt.format(Math.round(totMarked - totCost))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="mt-4 text-[11px] text-[var(--muted)]">
          Per-row profit% inputs are disabled until{" "}
          <span className="mono">chart_parts.profit_pct</span> exists.
          Use the global% above and{" "}
          <span className="mono">?cat=</span> to slice the catalog.
          Reference: {qs({ pct: "10" })} shows a 10% preview.
        </div>
      </div>
    </Shell>
  );
}
