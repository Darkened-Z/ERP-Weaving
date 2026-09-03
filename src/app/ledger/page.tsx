import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq, and, gte, lte, lt, sql } from "drizzle-orm";
import { today } from "@/lib/time";

export const dynamic = "force-dynamic";

const yearStart = () => `${today().slice(0, 4)}-01-01`;

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string; vtype?: string }>;
}) {
  const params = await searchParams;
  const selectedAccount = params.account || null;
  const vtypeFilter = params.vtype?.trim() || "";

  const accounts = await db
    .select()
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.code);

  const [profile] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const currentFy = profile?.currentFy ?? null;

  let fyStartDefault = yearStart();
  if (currentFy) {
    const [fy] = await db
      .select({ startDate: schema.fiscalYears.startDate })
      .from(schema.fiscalYears)
      .where(eq(schema.fiscalYears.code, currentFy))
      .limit(1);
    if (fy?.startDate) fyStartDefault = fy.startDate;
  }

  const dateFrom = params.from?.trim() || fyStartDefault;
  const dateTo = params.to?.trim() || today();

  const vtypesRaw = await db
    .selectDistinct({ vtype: schema.transDetail.vtype })
    .from(schema.transDetail)
    .orderBy(schema.transDetail.vtype);
  const vtypes = vtypesRaw.map((r) => r.vtype).filter(Boolean);

  const pickerOptions = accounts
    .filter((a) => a.level >= 4)
    .map((a) => ({ value: a.code, label: `${a.code} — ${a.description}` }));

  let entries: {
    vdate: string;
    vtype: string;
    vno: number;
    narration: string | null;
    debit: number;
    credit: number;
    balance: number;
  }[] = [];

  let accountInfo: (typeof schema.chartOfAccounts.$inferSelect) | null = null;
  let openingBalance = 0;

  if (selectedAccount) {
    const [found] = await db
      .select()
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, selectedAccount));
    accountInfo = found ?? null;

    const openingConds = [
      eq(schema.transDetail.accCode, selectedAccount),
      lt(schema.transMain.vdate, dateFrom),
    ];
    if (vtypeFilter) openingConds.push(eq(schema.transDetail.vtype, vtypeFilter));
    const [opening] = await db
      .select({
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
      .where(and(...openingConds));
    openingBalance = (opening?.d ?? 0) - (opening?.c ?? 0);

    const rangeConds = [
      eq(schema.transDetail.accCode, selectedAccount),
      gte(schema.transMain.vdate, dateFrom),
      lte(schema.transMain.vdate, dateTo),
    ];
    if (vtypeFilter) rangeConds.push(eq(schema.transDetail.vtype, vtypeFilter));

    const raw = await db
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
          eq(schema.transDetail.vno, schema.transMain.vno),
        ),
      )
      .where(and(...rangeConds))
      .orderBy(schema.transMain.vdate, schema.transDetail.vtype, schema.transDetail.vno);

    let running = openingBalance;
    entries = raw.map((r) => {
      running += r.debit - r.credit;
      return { ...r, balance: running };
    });
  }

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));
  const closingBalance = entries.length > 0 ? entries[entries.length - 1].balance : openingBalance;
  const totalDr = entries.reduce((s, e) => s + e.debit, 0);
  const totalCr = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <Shell active="ledger">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="page-title">General Ledger</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Account-wise transaction details
              {currentFy ? ` · FY ${currentFy}` : ""}
            </p>
          </div>
          <div className="no-print">
            <PrintButton label="Print" />
          </div>
        </div>

        <div className="mb-8">
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label className="label block mb-1">Account</label>
              <Combobox
                name="account"
                options={pickerOptions}
                defaultValue={selectedAccount ?? ""}
                placeholder="Select account..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Date From</label>
              <input
                type="date"
                name="from"
                className="input-box mono"
                defaultValue={dateFrom}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Date To</label>
              <input
                type="date"
                name="to"
                className="input-box mono"
                defaultValue={dateTo}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">V.Type</label>
              <select
                name="vtype"
                className="input-box mono"
                defaultValue={vtypeFilter}
              >
                <option value="">All</option>
                {vtypes.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <button type="submit" className="btn btn-sm w-full">
                View
              </button>
            </div>
          </form>
        </div>

        {selectedAccount && accountInfo && (
          <div>
            <div className="border border-black p-6 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>SR#</th>
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
                  <tr className="bg-gray-50 font-semibold">
                    <td className="mono text-[12px] text-center text-[var(--muted)]">0</td>
                    <td className="mono text-[13px]">{dateFrom}</td>
                    <td>
                      <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                        OP
                      </span>
                    </td>
                    <td className="mono">—</td>
                    <td className="text-[var(--muted)] italic">Opening Balance</td>
                    <td className="mono text-right">
                      {openingBalance > 0 ? formatNum(openingBalance) : ""}
                    </td>
                    <td className="mono text-right">
                      {openingBalance < 0 ? formatNum(openingBalance) : ""}
                    </td>
                    <td className="mono text-right font-semibold">
                      {formatNum(openingBalance)}{" "}
                      <span className="text-[11px] text-[var(--muted)]">
                        {openingBalance >= 0 ? "Dr" : "Cr"}
                      </span>
                    </td>
                  </tr>
                  {entries.map((entry, idx) => (
                    <tr key={idx}>
                      <td className="mono text-[12px] text-center text-[var(--muted)]">{idx + 1}</td>
                      <td className="mono text-[13px]">{entry.vdate}</td>
                      <td>
                        <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                          {entry.vtype}
                        </span>
                      </td>
                      <td className="mono">{entry.vno}</td>
                      <td className="text-[var(--muted)]">{entry.narration}</td>
                      <td className="mono text-right">
                        {entry.debit > 0 ? formatNum(entry.debit) : ""}
                      </td>
                      <td className="mono text-right">
                        {entry.credit > 0 ? formatNum(entry.credit) : ""}
                      </td>
                      <td className="mono text-right font-semibold">
                        {formatNum(entry.balance)}{" "}
                        <span className="text-[11px] text-[var(--muted)]">
                          {entry.balance >= 0 ? "Dr" : "Cr"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center text-[13px] text-[var(--muted)] py-6"
                      >
                        No transactions in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black">
                    <td colSpan={5} className="font-bold text-[13px] uppercase tracking-[0.05em]">
                      Closing Balance ({dateTo})
                    </td>
                    <td className="mono text-right font-bold">{formatNum(totalDr)}</td>
                    <td className="mono text-right font-bold">{formatNum(totalCr)}</td>
                    <td className="mono text-right font-extrabold text-[15px]">
                      {formatNum(closingBalance)}{" "}
                      <span className="text-[11px]">
                        {closingBalance >= 0 ? "Dr" : "Cr"}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
