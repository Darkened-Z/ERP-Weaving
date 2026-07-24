import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq, and, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const params = await searchParams;
  const selectedAccount = params.account || null;

  const accounts = await db
    .select()
    .from(schema.chartOfAccounts)
    .where(gte(schema.chartOfAccounts.level, 3))
    .orderBy(schema.chartOfAccounts.code);

  let ledgerEntries: {
    vdate: string;
    vtype: string;
    vno: number;
    narration: string | null;
    debit: number;
    credit: number;
  }[] = [];

  let accountInfo: (typeof schema.chartOfAccounts.$inferSelect) | null = null;

  if (selectedAccount) {
    const [found] = await db
      .select()
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, selectedAccount));
    accountInfo = found ?? null;

    ledgerEntries = await db
      .select({
        vdate: schema.transMain.vdate,
        vtype: schema.transDetail.vtype,
        vno: schema.transDetail.vno,
        narration: schema.transDetail.narration,
        debit: schema.transDetail.debit,
        credit: schema.transDetail.credit,
      })
      .from(schema.transDetail)
      .innerJoin(
        schema.transMain,
        and(
          eq(schema.transDetail.fyCode, schema.transMain.fyCode),
          eq(schema.transDetail.vtype, schema.transMain.vtype),
          eq(schema.transDetail.vno, schema.transMain.vno)
        )
      )
      .where(eq(schema.transDetail.accCode, selectedAccount))
      .orderBy(schema.transMain.vdate, schema.transDetail.vno);
  }

  let runningBalance = 0;
  const formatNum = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));

  return (
    <Shell active="ledger">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">General Ledger</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">Account-wise transaction details</p>
        </div>

        <div className="mb-8">
          <label className="label block mb-2">Select Account</label>
          <form method="GET" className="flex gap-2">
            <select name="account" defaultValue={selectedAccount ?? ""} className="input-box mono flex-1 max-w-md">
              <option value="">-- Select an account --</option>
              {accounts.map((acc) => (
                <option key={acc.code} value={acc.code}>
                  {acc.code} — {acc.description}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-sm">View</button>
          </form>
        </div>

        {selectedAccount && accountInfo && (
          <div>
            <div className="border border-black p-6 mb-6">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="label">Account Code</div>
                  <div className="mono text-lg font-bold mt-1">{accountInfo.code}</div>
                </div>
                <div className="col-span-2">
                  <div className="label">Description</div>
                  <div className="text-lg font-bold mt-1">{accountInfo.description}</div>
                </div>
                <div className="text-right">
                  <div className="label">Level</div>
                  <div className="mono text-lg font-bold mt-1">L{accountInfo.level}</div>
                </div>
              </div>
            </div>

            {ledgerEntries.length === 0 ? (
              <p className="text-[var(--muted)] text-[14px] py-8">No transactions found for this account.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>V.No</th>
                    <th>Narration</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.map((entry, idx) => {
                    runningBalance += entry.debit - entry.credit;
                    return (
                      <tr key={idx}>
                        <td className="mono text-[13px]">{entry.vdate}</td>
                        <td>
                          <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                            {entry.vtype}
                          </span>
                        </td>
                        <td className="mono">{entry.vno}</td>
                        <td className="text-[var(--muted)]">{entry.narration}</td>
                        <td className="mono text-right">{entry.debit > 0 ? formatNum(entry.debit) : ""}</td>
                        <td className="mono text-right">{entry.credit > 0 ? formatNum(entry.credit) : ""}</td>
                        <td className="mono text-right font-semibold">
                          {formatNum(runningBalance)}{" "}
                          <span className="text-[11px] text-[var(--muted)]">
                            {runningBalance >= 0 ? "Dr" : "Cr"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black">
                    <td colSpan={4} className="font-bold text-[13px] uppercase tracking-[0.05em]">
                      Closing Balance
                    </td>
                    <td className="mono text-right font-bold">
                      {formatNum(ledgerEntries.reduce((s, e) => s + e.debit, 0))}
                    </td>
                    <td className="mono text-right font-bold">
                      {formatNum(ledgerEntries.reduce((s, e) => s + e.credit, 0))}
                    </td>
                    <td className="mono text-right font-extrabold text-[15px]">
                      {formatNum(runningBalance)}{" "}
                      <span className="text-[11px]">{runningBalance >= 0 ? "Dr" : "Cr"}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
