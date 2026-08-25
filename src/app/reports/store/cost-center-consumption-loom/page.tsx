import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql, eq } from "drizzle-orm";
import { today as todayFn } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function monthsBackFrom(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default async function CostCenterLoomPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || monthsBackFrom(today, 1);
  const to = params.to?.trim() || today;

  const ccList = await db.select().from(schema.costCenters);
  const loomCcCodes = new Set(
    ccList
      .filter((c) => /loom/i.test(c.description))
      .map((c) => String(c.code))
  );
  const ccMap = new Map(ccList.map((c) => [String(c.code), c.description]));

  const rowsRaw = await db
    .select({
      ccCode: schema.storeDemandDetail.ccCode,
      qty: sql<number>`coalesce(sum(${schema.storeDemandDetail.qty}), 0)`,
      amount: sql<number>`coalesce(sum(${schema.storeDemandDetail.amount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(schema.storeDemandDetail)
    .innerJoin(schema.storeDemands, eq(schema.storeDemandDetail.demandId, schema.storeDemands.id))
    .where(and(gte(schema.storeDemands.demandDate, from), lte(schema.storeDemands.demandDate, to)))
    .groupBy(schema.storeDemandDetail.ccCode);

  const rows = rowsRaw
    .filter((r) => r.ccCode && loomCcCodes.has(r.ccCode))
    .map((r) => ({
      ccCode: r.ccCode ?? "-",
      ccDesc: ccMap.get(r.ccCode ?? "") ?? r.ccCode ?? "-",
      count: r.count ?? 0,
      qty: r.qty ?? 0,
      amount: r.amount ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const totQty = rows.reduce((s, r) => s + r.qty, 0);
  const totAmt = rows.reduce((s, r) => s + r.amount, 0);

  const excelRows = rows.map((r) => ({
    ccCode: r.ccCode,
    ccDesc: r.ccDesc,
    count: r.count,
    qty: r.qty,
    amount: Math.round(r.amount),
  }));

  return (
    <Shell active="s-cc-loom">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Cost Center Consumption — Loom-wise</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} loom cost centers &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "ccCode", label: "CC Code" },
                { key: "ccDesc", label: "Loom / CC" },
                { key: "count", label: "Issues" },
                { key: "qty", label: "Qty" },
                { key: "amount", label: "Value" },
              ]}
              filename="cost-center-consumption-loom"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Cost Center Consumption — Loom-wise</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/store/cost-center-consumption-loom" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{rows.length}</div>
            <div className="stat-label">Looms</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totQty)}</div>
            <div className="stat-label">Total Qty</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totAmt)}</div>
            <div className="stat-label">Total Value</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>CC Code</th>
                <th>Loom / Cost Center</th>
                <th className="text-right">Issues</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-[var(--muted)] py-8">
                    No loom cost centers matched (looked for &quot;loom&quot; in cost center description)
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.ccCode}</td>
                    <td className="text-[13px]">{r.ccDesc}</td>
                    <td className="mono text-right">{fmt(r.count)}</td>
                    <td className="mono text-right">{fmt(r.qty)}</td>
                    <td className="mono text-right">{fmt(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={3}>GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(totQty)}</td>
                  <td className="mono text-right">{fmt(totAmt)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
