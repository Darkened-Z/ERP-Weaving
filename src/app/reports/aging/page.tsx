import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AgingPage() {
  const balances = await db
    .select({
      accCode: schema.transDetail.accCode,
      totalDebit: sql<number>`sum(debit)`,
      totalCredit: sql<number>`sum(credit)`,
    })
    .from(schema.transDetail)
    .groupBy(schema.transDetail.accCode);

  const accounts = await db.select().from(schema.chartOfAccounts);

  const balanceMap = new Map(balances.map((b) => [b.accCode, b]));

  const creditors = accounts
    .filter(
      (a) =>
        a.codeHead === "3" &&
        (a.level ?? 0) === 4 &&
        (a.code ?? "").startsWith("3.04")
    )
    .map((a) => {
      const b = balanceMap.get(a.code);
      if (!b) return null;
      const net = (b.totalCredit ?? 0) - (b.totalDebit ?? 0);
      if (net === 0) return null;
      return {
        code: a.code,
        name: a.description ?? "",
        balance: net,
        status: net > 0 ? "PAYABLE" : "OVERPAID",
      };
    })
    .filter(Boolean) as {
    code: string;
    name: string;
    balance: number;
    status: string;
  }[];

  const debtors = accounts
    .filter(
      (a) =>
        a.codeHead === "3" &&
        (a.level ?? 0) === 4 &&
        (a.code ?? "").startsWith("3.05")
    )
    .map((a) => {
      const b = balanceMap.get(a.code);
      if (!b) return null;
      const net = (b.totalDebit ?? 0) - (b.totalCredit ?? 0);
      if (net === 0) return null;
      return {
        code: a.code,
        name: a.description ?? "",
        balance: net,
        status: net > 0 ? "RECEIVABLE" : "ADVANCE",
      };
    })
    .filter(Boolean) as {
    code: string;
    name: string;
    balance: number;
    status: string;
  }[];

  const totalCreditors = creditors.reduce(
    (s, r) => s + Math.abs(r.balance),
    0
  );
  const totalDebtors = debtors.reduce((s, r) => s + Math.abs(r.balance), 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));

  return (
    <Shell active="aging">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Aging Analysis</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {creditors.length} creditors, {debtors.length} debtors
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{creditors.length}</div>
            <div className="stat-label">Creditors</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(totalCreditors)}</div>
            <div className="stat-label">Total Payable</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{debtors.length}</div>
            <div className="stat-label">Debtors</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(totalDebtors)}</div>
            <div className="stat-label">Total Receivable</div>
          </div>
        </div>

        <div className="mb-12">
          <div className="section-title">Creditor Aging</div>
          <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Party Code</th>
                <th>Party Name</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {creditors.map((r) => (
                <tr key={r.code}>
                  <td className="mono">{r.code}</td>
                  <td>{r.name}</td>
                  <td className="mono text-right">{fmt(r.balance)}</td>
                  <td>
                    <span
                      className="inline-block text-[11px] px-2 py-0.5 uppercase"
                      style={{
                        letterSpacing: "0.05em",
                        background:
                          r.status === "PAYABLE" ? "black" : "transparent",
                        color: r.status === "PAYABLE" ? "white" : "black",
                        border: "1px solid black",
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {creditors.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center text-[var(--muted)]"
                  >
                    No creditor balances
                  </td>
                </tr>
              )}
            </tbody>
            {creditors.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>Total</td>
                  <td className="mono text-right">{fmt(totalCreditors)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          </div>
        </div>

        <div className="mb-12">
          <div className="section-title">Debtor Aging</div>
          <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Party Code</th>
                <th>Party Name</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {debtors.map((r) => (
                <tr key={r.code}>
                  <td className="mono">{r.code}</td>
                  <td>{r.name}</td>
                  <td className="mono text-right">{fmt(r.balance)}</td>
                  <td>
                    <span
                      className="inline-block text-[11px] px-2 py-0.5 uppercase"
                      style={{
                        letterSpacing: "0.05em",
                        background:
                          r.status === "RECEIVABLE" ? "black" : "transparent",
                        color:
                          r.status === "RECEIVABLE" ? "white" : "black",
                        border: "1px solid black",
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {debtors.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center text-[var(--muted)]"
                  >
                    No debtor balances
                  </td>
                </tr>
              )}
            </tbody>
            {debtors.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>Total</td>
                  <td className="mono text-right">{fmt(totalDebtors)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
