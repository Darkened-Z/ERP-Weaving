import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { and, eq, lte, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { today } from "@/lib/time";
import { DateBox } from "@/components/date-box";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  // Balances run across fiscal years (the ledger carries them forward the same
  // way), cut off at a date so a year-end TB can be pulled and post-dated
  // vouchers don't leak into today's figures.
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(params.asof ?? "") ? params.asof! : today();
  const balances = await db
    .select({
      accCode: schema.transDetail.accCode,
      totalDebit: sql<number>`sum(${schema.transDetail.debit})`,
      totalCredit: sql<number>`sum(${schema.transDetail.credit})`,
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
    .where(lte(schema.transMain.vdate, asOf))
    .groupBy(schema.transDetail.accCode);

  const accounts = await db.select().from(schema.chartOfAccounts);

  const accountMap = new Map(accounts.map((a) => [a.code, a]));

  const rows = balances
    .map((b) => {
      const acc = accountMap.get(b.accCode ?? "");
      if (!acc || (acc.level ?? 0) < 3) return null;
      const net = (b.totalDebit ?? 0) - (b.totalCredit ?? 0);
      if (net === 0) return null;
      return {
        code: acc.code,
        description: acc.description ?? "",
        debit: net > 0 ? net : 0,
        credit: net < 0 ? Math.abs(net) : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.code.localeCompare(b!.code)) as {
    code: string;
    description: string;
    debit: number;
    credit: number;
  }[];

  const totalDebits = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredits = rows.reduce((s, r) => s + r.credit, 0);

  const fmt = (n: number) =>
    n > 0 ? new Intl.NumberFormat("en-PK").format(Math.round(n)) : "-";

  return (
    <Shell active="trial-balance">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Trial Balance</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} accounts with activity · as of {asOf}
          </p>
        </div>

        <form method="GET" className="mb-8 flex items-end gap-3 no-print">
          <div>
            <label className="label block mb-2">As of</label>
            <DateBox name="asof" defaultValue={asOf} />
          </div>
          <button type="submit" className="btn btn-sm">View</button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Accounts</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">
              {new Intl.NumberFormat("en-PK").format(Math.round(totalDebits))}
            </div>
            <div className="stat-label">Total Debits</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">
              {new Intl.NumberFormat("en-PK").format(Math.round(totalCredits))}
            </div>
            <div className="stat-label">Total Credits</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Account Code</th>
              <th>Description</th>
              <th className="text-right">Debit Balance</th>
              <th className="text-right">Credit Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="mono">{r.code}</td>
                <td>{r.description}</td>
                <td className="mono text-right">{fmt(r.debit)}</td>
                <td className="mono text-right">{fmt(r.credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
              <td colSpan={2}>Total</td>
              <td className="mono text-right">
                {new Intl.NumberFormat("en-PK").format(Math.round(totalDebits))}
              </td>
              <td className="mono text-right">
                {new Intl.NumberFormat("en-PK").format(
                  Math.round(totalCredits)
                )}
              </td>
            </tr>
            {Math.abs(totalDebits - totalCredits) >= 1 && (
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={2} className="text-[var(--danger)] text-[12px] uppercase">
                  Difference (out of balance)
                </td>
                <td colSpan={2} className="mono text-right text-[var(--danger)]">
                  {new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(totalDebits - totalCredits)))}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
        </div>
      </div>
    </Shell>
  );
}
