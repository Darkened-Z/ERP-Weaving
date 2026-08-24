import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

const REVENUE_HEADS = new Set(["4", "5"]);
const EXPENSE_HEADS = new Set(["6", "7"]);

export default async function PLAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const dateFrom = params.from?.trim() || yearStart();
  const dateTo = params.to?.trim() || today();

  const balances = await db
    .select({
      accCode: schema.transDetail.accCode,
      d: sql<number>`coalesce(sum(${schema.transDetail.debit}), 0)`,
      c: sql<number>`coalesce(sum(${schema.transDetail.credit}), 0)`,
    })
    .from(schema.transDetail)
    .innerJoin(
      schema.transMain,
      and(
        eq(schema.transDetail.fyCode, schema.transMain.fyCode),
        eq(schema.transDetail.vtype, schema.transMain.vtype),
        eq(schema.transDetail.vno, schema.transMain.vno),
      ),
    )
    .where(
      and(
        gte(schema.transMain.vdate, dateFrom),
        lte(schema.transMain.vdate, dateTo),
      ),
    )
    .groupBy(schema.transDetail.accCode);

  const accounts = await db.select().from(schema.chartOfAccounts);
  const accMap = new Map(accounts.map((a) => [a.code, a]));

  type Line = { code: string; description: string; amount: number };
  const revenues: Line[] = [];
  const expenses: Line[] = [];

  for (const b of balances) {
    const acc = accMap.get(b.accCode ?? "");
    if (!acc) continue;
    const head = acc.codeHead;
    if (REVENUE_HEADS.has(head)) {
      const amt = (b.c ?? 0) - (b.d ?? 0);
      if (amt !== 0) revenues.push({ code: acc.code, description: acc.description ?? "", amount: amt });
    } else if (EXPENSE_HEADS.has(head)) {
      const amt = (b.d ?? 0) - (b.c ?? 0);
      if (amt !== 0) expenses.push({ code: acc.code, description: acc.description ?? "", amount: amt });
    }
  }

  revenues.sort((a, b) => a.code.localeCompare(b.code));
  expenses.sort((a, b) => a.code.localeCompare(b.code));

  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
  const netResult = totalRevenue - totalExpense;

  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));

  const excelRows = [
    ...revenues.map((r) => ({ section: "REVENUE", code: r.code, description: r.description, amount: r.amount })),
    ...expenses.map((r) => ({ section: "EXPENSE", code: r.code, description: r.description, amount: r.amount })),
  ];

  return (
    <Shell active="fin-pl">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="page-title">Profit &amp; Loss Account</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {dateFrom} to {dateTo} · {revenues.length + expenses.length} accounts
            </p>
          </div>
          <div className="no-print flex items-center gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "section", label: "Section" },
                { key: "code", label: "Code" },
                { key: "description", label: "Description" },
                { key: "amount", label: "Amount" },
              ]}
              filename="profit-and-loss"
            />
            <PrintButton label="Print" />
          </div>
        </div>

        <div className="mb-8 no-print">
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label className="label block mb-1">Date From</label>
              <input type="date" name="from" className="input-box mono" defaultValue={dateFrom} />
            </div>
            <div className="sm:col-span-4">
              <label className="label block mb-1">Date To</label>
              <input type="date" name="to" className="input-box mono" defaultValue={dateTo} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-sm w-full">View</button>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(totalRevenue)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(totalExpense)}</div>
            <div className="stat-label">Total Expense</div>
          </div>
          <div className="bg-white p-6" style={{ background: netResult >= 0 ? "#e6f4ea" : "#fdecec" }}>
            <div className="stat-value">{fmt(netResult)}</div>
            <div className="stat-label">Net {netResult >= 0 ? "Profit" : "Loss"}</div>
          </div>
        </div>

        <div className="mb-12">
          <div className="section-title">Revenue</div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {revenues.map((r) => (
                  <tr key={r.code}>
                    <td className="mono">{r.code}</td>
                    <td>{r.description}</td>
                    <td className="mono text-right">{fmt(r.amount)}</td>
                  </tr>
                ))}
                {revenues.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-[var(--muted)]">No revenue in this range</td>
                  </tr>
                )}
              </tbody>
              {revenues.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                    <td colSpan={2}>Total Revenue</td>
                    <td className="mono text-right">{fmt(totalRevenue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="mb-12">
          <div className="section-title">Expenses</div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((r) => (
                  <tr key={r.code}>
                    <td className="mono">{r.code}</td>
                    <td>{r.description}</td>
                    <td className="mono text-right">{fmt(r.amount)}</td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-[var(--muted)]">No expenses in this range</td>
                  </tr>
                )}
              </tbody>
              {expenses.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                    <td colSpan={2}>Total Expenses</td>
                    <td className="mono text-right">{fmt(totalExpense)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div
          className="flex justify-between items-center px-4 py-4 mono text-[15px]"
          style={{ borderTop: "3px double black", borderBottom: "3px double black", fontWeight: 700 }}
        >
          <span className="uppercase tracking-[0.06em]">
            Net {netResult >= 0 ? "Profit" : "Loss"} for the Period
          </span>
          <span>{fmt(netResult)}</span>
        </div>
      </div>
    </Shell>
  );
}
