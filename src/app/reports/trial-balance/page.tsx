import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage() {
  const balances = await db
    .select({
      accCode: schema.transDetail.accCode,
      totalDebit: sql<number>`sum(debit)`,
      totalCredit: sql<number>`sum(credit)`,
    })
    .from(schema.transDetail)
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
            {rows.length} accounts with activity
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px bg-black border border-black mb-10">
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
          </tfoot>
        </table>
      </div>
    </Shell>
  );
}
