import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq, and, gte, lte, lt, sql, inArray } from "drizzle-orm";
import { today } from "@/lib/time";
import { DateBox } from "@/components/date-box";

export const dynamic = "force-dynamic";

const yearStart = () => `${today().slice(0, 4)}-01-01`;

// Module scope on purpose: the ledger builds its rows before the render block,
// and a const declared down there is in its temporal dead zone up here — which
// crashed every ledger that contained a split voucher.
const formatNum = (n: number) =>
  new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));

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
    fyCode: string | null;
    vtype: string;
    img?: string | null;
    vno: number;
    narration: string | null;
    against?: string;
    splitCount?: number;
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
        fyCode: schema.transDetail.fyCode,
        vtype: schema.transDetail.vtype,
        vno: schema.transDetail.vno,
        img: schema.transMain.img,
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

    // What each line sits against. One cheque paid to a party has a single
    // contra and the ledger can name it; an advance paid as three cheques PLUS
    // cash has several, and naming only the first would misstate how the money
    // actually moved. Those read SPLIT, with every leg and its amount spelled
    // out — which is what the client means by split mode.
    const voucherKeys = new Set(raw.map((r) => `${r.fyCode}|${r.vtype}|${r.vno}`));
    const contraByVoucher = new Map<string, { code: string; amount: number; side: "DR" | "CR" }[]>();
    if (voucherKeys.size) {
      const allLegs = await db
        .select({
          fyCode: schema.transDetail.fyCode,
          vtype: schema.transDetail.vtype,
          vno: schema.transDetail.vno,
          accCode: schema.transDetail.accCode,
          debit: schema.transDetail.debit,
          credit: schema.transDetail.credit,
        })
        .from(schema.transDetail)
        .where(inArray(schema.transDetail.vno, Array.from(new Set(raw.map((r) => r.vno)))));
      for (const l of allLegs) {
        const k = `${l.fyCode}|${l.vtype}|${l.vno}`;
        if (!voucherKeys.has(k)) continue;
        const arr = contraByVoucher.get(k) ?? [];
        arr.push({
          code: l.accCode ?? "",
          amount: (l.debit ?? 0) + (l.credit ?? 0),
          side: (l.debit ?? 0) > 0 ? "DR" : "CR",
        });
        contraByVoucher.set(k, arr);
      }
    }
    const descByCode = new Map(accounts.map((a) => [a.code, a.description ?? a.code]));

    let running = openingBalance;
    entries = raw.map((r) => {
      running += r.debit - r.credit;
      const mySide: "DR" | "CR" = r.debit > 0 ? "DR" : "CR";
      const legs = (contraByVoucher.get(`${r.fyCode}|${r.vtype}|${r.vno}`) ?? [])
        .filter((l) => l.side !== mySide && l.code !== selectedAccount && l.amount > 0);
      const against =
        legs.length === 0
          ? ""
          : legs.length === 1
          ? descByCode.get(legs[0].code) ?? legs[0].code
          : `SPLIT — ${legs
              .map((l) => `${descByCode.get(l.code) ?? l.code} ${formatNum(l.amount)}`)
              .join(" · ")}`;
      return { ...r, balance: running, against, splitCount: legs.length };
    });
  }

  const closingBalance = entries.length > 0 ? entries[entries.length - 1].balance : openingBalance;
  const totalDr = entries.reduce((s, e) => s + e.debit, 0);
  const totalCr = entries.reduce((s, e) => s + e.credit, 0);

  return (
    <Shell active="ledger">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="page-title no-print">General Ledger</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2 no-print">
              Account-wise transaction details
              {currentFy ? ` · FY ${currentFy}` : ""}
            </p>
          </div>
          <div className="no-print">
            <PrintButton label="Print" />
          </div>
        </div>

        {/* A printed ledger is handed to the party, so the screen furniture —
            the filter row and its View button — stays behind. */}
        <div className="mb-8 no-print">
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
              <DateBox name="from" className="input-box mono" defaultValue={dateFrom} />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Date To</label>
              <DateBox name="to" className="input-box mono" defaultValue={dateTo} />
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
                    <th>V.No</th>
                    <th>Narration</th>
                    <th className="no-print">Img</th>
                    <th className="no-print">Against / Mode</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="mono text-[12px] text-center text-[var(--muted)]">0</td>
                    <td className="mono text-[13px]">{dateFrom}</td>
                    <td className="mono font-bold">OPN-0</td>
                    <td className="text-[var(--muted)] italic">Opening Balance</td>
                    <td className="no-print"></td>
                    <td className="no-print"></td>
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
                      {/* One column, the way the mill's own ledger prints it:
                          CP-986, JV-650, OPN-0 — type and number together. */}
                      <td className="mono font-bold whitespace-nowrap">
                        {entry.vtype}-{entry.vno}
                      </td>
                      <td className="text-[var(--muted)]">{entry.narration}</td>
                      <td className="text-center no-print">
                        {entry.img ? (
                          <a
                            href={entry.img}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] underline"
                            title="Open this voucher's image"
                          >
                            Img
                          </a>
                        ) : (
                          <span className="text-[11px] text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="text-[11px] no-print">
                        {(entry.splitCount ?? 0) > 1 ? (
                          <span className="mono">
                            <span className="border border-black px-1 font-bold">SPLIT</span>{" "}
                            {entry.against?.replace("SPLIT — ", "")}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">{entry.against}</span>
                        )}
                      </td>
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
                        colSpan={7}
                        className="text-center text-[13px] text-[var(--muted)] py-6"
                      >
                        No transactions in this date range.
                      </td>
                      <td className="no-print"></td>
                      <td className="no-print"></td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black">
                    <td colSpan={4} className="font-bold text-[13px] uppercase tracking-[0.05em]">
                      Closing Balance ({dateTo})
                    </td>
                    <td className="no-print"></td>
                    <td className="no-print"></td>
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
