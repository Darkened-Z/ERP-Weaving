import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import { today as todayFn } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function monthsBackFrom(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default async function DepartmentWisePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || monthsBackFrom(today, 1);
  const to = params.to?.trim() || today;

  const rows = await db
    .select({
      department: schema.storeDemands.department,
      demands: sql<number>`count(distinct ${schema.storeDemands.id})`,
      totalAmount: sql<number>`coalesce(sum(${schema.storeDemands.totalAmount}), 0)`,
      itemCount: sql<number>`coalesce(sum(${schema.storeDemands.itemCount}), 0)`,
    })
    .from(schema.storeDemands)
    .where(and(gte(schema.storeDemands.demandDate, from), lte(schema.storeDemands.demandDate, to)))
    .groupBy(schema.storeDemands.department)
    .orderBy(sql`sum(${schema.storeDemands.totalAmount}) desc`);

  const totAmt = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const totDmd = rows.reduce((s, r) => s + (r.demands ?? 0), 0);

  const excelRows = rows.map((r) => ({
    department: r.department,
    demands: r.demands,
    itemCount: r.itemCount,
    totalAmount: Math.round(r.totalAmount ?? 0),
  }));

  return (
    <Shell active="s-dept">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Department-wise Store Consumption</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} departments &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "department", label: "Department" },
                { key: "demands", label: "Demands" },
                { key: "itemCount", label: "Items" },
                { key: "totalAmount", label: "Total Amount" },
              ]}
              filename="department-wise-consumption"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Department-wise Store Consumption</h1>
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
            <a href="/reports/store/department-wise" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{rows.length}</div>
            <div className="stat-label">Departments</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totDmd)}</div>
            <div className="stat-label">Demands</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totAmt)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th className="text-right">Demands</th>
                <th className="text-right">Items</th>
                <th className="text-right">Amount</th>
                <th className="text-right">% Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-[var(--muted)] py-8">
                    No data
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-[13px]">{r.department}</td>
                    <td className="mono text-right">{fmt(r.demands)}</td>
                    <td className="mono text-right">{fmt(r.itemCount)}</td>
                    <td className="mono text-right">{fmt(r.totalAmount)}</td>
                    <td className="mono text-right">
                      {totAmt > 0 ? (((r.totalAmount ?? 0) / totAmt) * 100).toFixed(1) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td>GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(totDmd)}</td>
                  <td className="mono text-right">
                    {fmt(rows.reduce((s, r) => s + (r.itemCount ?? 0), 0))}
                  </td>
                  <td className="mono text-right">{fmt(totAmt)}</td>
                  <td className="mono text-right">100.0</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
