import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, lt, sql } from "drizzle-orm";
import { today } from "@/lib/time";

export const dynamic = "force-dynamic";

const yearStart = () => `${new Date().getFullYear()}-01-01`;

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  await requireSession();
  const params = await searchParams;

  const accounts = await db
    .select()
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.code);

  const cashBankAccounts = accounts.filter((a) => {
    if ((a.level ?? 0) < 3) return false;
    const code = a.code ?? "";
    const short = (a.descShort ?? "").toUpperCase();
    const desc = (a.description ?? "").toUpperCase();
    if (short === "CASH" || code.startsWith("1.01.01")) return true;
    if (code.startsWith("1.01.11")) return true;
    if (code.startsWith("1.03")) return true;
    if (short.includes("BANK") || desc.includes("BANK")) return true;
    return false;
  });

  const cashAccount =
    cashBankAccounts.find((a) => (a.descShort ?? "").toUpperCase() === "CASH") ||
    cashBankAccounts.find((a) => (a.code ?? "").startsWith("1.01.01"));

  const dateFrom = params.from?.trim() || yearStart();
  const dateTo = params.to?.trim() || today();
  const selectedAccount = params.account?.trim() || cashAccount?.code || cashBankAccounts[0]?.code || "";

  const pickerOpts = cashBankAccounts.map((a) => ({
    value: a.code,
    label: `${a.code} — ${a.description}${a.descShort ? ` (${a.descShort})` : ""}`,
  }));

  const summary = await Promise.all(
    cashBankAccounts.map(async (a) => {
      const [row] = await db
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
        .where(
          and(
            eq(schema.transDetail.accCode, a.code),
            lte(schema.transMain.vdate, dateTo),
          ),
        );
      return {
        code: a.code,
        description: a.description ?? "",
        descShort: a.descShort ?? "",
        balance: (row?.d ?? 0) - (row?.c ?? 0),
        isBank: !((a.descShort ?? "").toUpperCase() === "CASH" || (a.code ?? "").startsWith("1.01.01")),
      };
    }),
  );

  let openingBalance = 0;
  let entries: {
    vdate: string;
    vtype: string;
    vno: number;
    narration: string | null;
    debit: number;
    credit: number;
    balance: number;
  }[] = [];
  let selectedInfo: (typeof schema.chartOfAccounts.$inferSelect) | null = null;

  if (selectedAccount) {
    selectedInfo = accounts.find((a) => a.code === selectedAccount) ?? null;

    const [op] = await db
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
      .where(
        and(
          eq(schema.transDetail.accCode, selectedAccount),
          lt(schema.transMain.vdate, dateFrom),
        ),
      );
    openingBalance = (op?.d ?? 0) - (op?.c ?? 0);

    const raw = await db
      .select({
        vdate: schema.transMain.vdate,
        vtype: schema.transDetail.vtype,
        vno: schema.transDetail.vno,
        narration: schema.transDetail.narration,
        mainNarration: schema.transMain.narration,
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
      .where(
        and(
          eq(schema.transDetail.accCode, selectedAccount),
          gte(schema.transMain.vdate, dateFrom),
          lte(schema.transMain.vdate, dateTo),
        ),
      )
      .orderBy(schema.transMain.vdate, schema.transDetail.vtype, schema.transDetail.vno);

    let running = openingBalance;
    entries = raw.map((r) => {
      running += (r.debit ?? 0) - (r.credit ?? 0);
      return {
        vdate: r.vdate,
        vtype: r.vtype,
        vno: r.vno,
        narration: r.narration || r.mainNarration,
        debit: r.debit ?? 0,
        credit: r.credit ?? 0,
        balance: running,
      };
    });
  }

  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));
  const totalDr = entries.reduce((s, e) => s + e.debit, 0);
  const totalCr = entries.reduce((s, e) => s + e.credit, 0);
  const closing = entries.length > 0 ? entries[entries.length - 1].balance : openingBalance;

  const excelRows = entries.map((e) => ({
    date: e.vdate,
    vno: e.vno,
    vtype: e.vtype,
    narration: e.narration ?? "",
    debit: e.debit || "",
    credit: e.credit || "",
    balance: e.balance,
  }));

  return (
    <Shell active="fin-cashbook">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="page-title">Cash &amp; Bank Book</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {cashBankAccounts.length} accounts · {entries.length} entries in range
            </p>
          </div>
          <div className="no-print flex items-center gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "date", label: "Date" },
                { key: "vno", label: "V.No" },
                { key: "vtype", label: "V.Type" },
                { key: "narration", label: "Narration" },
                { key: "debit", label: "Debit" },
                { key: "credit", label: "Credit" },
                { key: "balance", label: "Balance" },
              ]}
              filename={`cash-book-${selectedAccount || "all"}`}
            />
            <PrintButton label="Print" />
          </div>
        </div>

        <div className="mb-8 no-print">
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label className="label block mb-1">Account</label>
              <Combobox
                name="account"
                options={pickerOpts}
                defaultValue={selectedAccount}
                placeholder="Select cash/bank account..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Date From</label>
              <input type="date" name="from" className="input-box mono" defaultValue={dateFrom} />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Date To</label>
              <input type="date" name="to" className="input-box mono" defaultValue={dateTo} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-sm w-full">View</button>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-10">
          {summary.map((s) => (
            <a
              key={s.code}
              href={`?account=${encodeURIComponent(s.code)}&from=${dateFrom}&to=${dateTo}`}
              className={`bg-white p-4 block hover:bg-[var(--surface)] transition-colors ${s.code === selectedAccount ? "outline outline-2 outline-black outline-offset-[-2px]" : ""}`}
            >
              <div className="stat-value text-[18px]">{fmt(s.balance)}</div>
              <div className="stat-label">
                {s.isBank ? "BANK" : "CASH"} · {s.descShort || s.code}
              </div>
              <div className="text-[10px] text-[var(--muted)] mono mt-1">
                {s.balance >= 0 ? "Dr" : "Cr"}
              </div>
            </a>
          ))}
          {summary.length === 0 && (
            <div className="bg-white p-6 text-[var(--muted)] col-span-4">
              No cash or bank accounts found.
            </div>
          )}
        </div>

        {selectedAccount && selectedInfo && (
          <div>
            <div className="section-title">
              {selectedInfo.description} <span className="mono text-[12px] text-[var(--muted)]">{selectedInfo.code}</span>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>V.No</th>
                    <th>V.Type</th>
                    <th>Narration</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="mono text-[13px]">{dateFrom}</td>
                    <td className="mono">—</td>
                    <td>
                      <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                        OP
                      </span>
                    </td>
                    <td className="text-[var(--muted)] italic">Opening Balance</td>
                    <td className="mono text-right">
                      {openingBalance > 0 ? fmt(openingBalance) : ""}
                    </td>
                    <td className="mono text-right">
                      {openingBalance < 0 ? fmt(openingBalance) : ""}
                    </td>
                    <td className="mono text-right font-semibold">
                      {fmt(openingBalance)} <span className="text-[11px] text-[var(--muted)]">{openingBalance >= 0 ? "Dr" : "Cr"}</span>
                    </td>
                  </tr>
                  {entries.map((e, i) => (
                    <tr key={i}>
                      <td className="mono text-[13px]">{e.vdate}</td>
                      <td className="mono">{e.vno}</td>
                      <td>
                        <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                          {e.vtype}
                        </span>
                      </td>
                      <td className="text-[13px]">{e.narration}</td>
                      <td className="mono text-right">{e.debit > 0 ? fmt(e.debit) : ""}</td>
                      <td className="mono text-right">{e.credit > 0 ? fmt(e.credit) : ""}</td>
                      <td className="mono text-right font-semibold">
                        {fmt(e.balance)} <span className="text-[11px] text-[var(--muted)]">{e.balance >= 0 ? "Dr" : "Cr"}</span>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-[var(--muted)] py-6">
                        No transactions in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                    <td colSpan={4}>Closing Balance ({dateTo})</td>
                    <td className="mono text-right">{fmt(totalDr)}</td>
                    <td className="mono text-right">{fmt(totalCr)}</td>
                    <td className="mono text-right">
                      {fmt(closing)} <span className="text-[11px]">{closing >= 0 ? "Dr" : "Cr"}</span>
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
