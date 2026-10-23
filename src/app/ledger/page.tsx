import { Shell } from "@/components/shell";
import { ImageLinks } from "@/components/image-links";
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
        lineImg: schema.transDetail.img,
        mainImg: schema.transMain.img,
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
      .orderBy(schema.transMain.vdate, schema.transMain.id);

    // A JV pair — exactly two lines with the same narration — is one
    // transaction: a photo on either line shows on both ledgers (owner
    // 2026-10-23, the bank slip was on the party line, the bank ledger showed —).
    const pairKey = (fy: string, vno: number, narr: string | null) => `${fy}|${vno}|${(narr ?? "").trim().toUpperCase()}`;
    const pairImg = new Map<string, string>();
    const jvNos = [...new Set(raw.filter((r) => r.vtype === "JV" && !r.lineImg && (r.narration ?? "").trim()).map((r) => r.vno))];
    if (jvNos.length) {
      const jvLines = await db
        .select({ fyCode: schema.transDetail.fyCode, vno: schema.transDetail.vno, narration: schema.transDetail.narration, img: schema.transDetail.img })
        .from(schema.transDetail)
        .where(and(eq(schema.transDetail.vtype, "JV"), inArray(schema.transDetail.vno, jvNos)));
      const groups = new Map<string, (string | null)[]>();
      for (const l of jvLines) {
        const k = pairKey(l.fyCode, l.vno, l.narration);
        groups.set(k, [...(groups.get(k) ?? []), l.img]);
      }
      for (const [k, imgs] of groups) {
        const withImg = imgs.filter(Boolean);
        if (imgs.length === 2 && withImg.length) pairImg.set(k, withImg[0]!);
      }
    }

    let running = openingBalance;
    entries = raw.map((r) => {
      running += r.debit - r.credit;
      const img = r.lineImg || (r.vtype === "JV" ? pairImg.get(pairKey(r.fyCode, r.vno, r.narration)) ?? null : r.mainImg);
      return { ...r, img, balance: running };
    });
  }

  // A packi sale's ledger line opens its Pakki Parchi bill. GPV numbers are the
  // parchi's own number (PP-0017 → GPV-17).
  const packiIdByVno = new Map<number, number>();
  if (entries.some((e) => e.vtype === "GPV")) {
    for (const p of await db.select({ id: schema.extPackiParchi.id, vNo: schema.extPackiParchi.vNo }).from(schema.extPackiParchi)) {
      const m = /(\d+)\s*$/.exec(p.vNo);
      if (m) packiIdByVno.set(parseInt(m[1], 10), p.id);
    }
  }
  const billHref = (e: { vtype: string; vno: number }) => {
    const id = e.vtype === "GPV" ? packiIdByVno.get(e.vno) : undefined;
    return id ? `/external/grey/packi-parchi/${id}/bill` : null;
  };

  const closingBalance = entries.length > 0 ? entries[entries.length - 1].balance : openingBalance;
  const totalDr = entries.reduce((s, e) => s + e.debit, 0);
  const totalCr = entries.reduce((s, e) => s + e.credit, 0);
  const dmy = (iso: string) => iso.split("-").reverse().join("-");

  // Recovery on a party ledger (owner 2026-10-22: "what percent has he paid,
  // and what is his progress"). A debtor's credit or a creditor's debit is a
  // payment; it is shown as a share of the balance it came off, and the footer
  // adds billed vs paid. Income / expense accounts have no "still due".
  const partySide: "debtor" | "creditor" | null = selectedAccount?.startsWith("1.01.01.")
    ? "debtor"
    : selectedAccount?.startsWith("3.03.")
      ? "creditor"
      : null;
  const paymentShare = (e: { debit: number; credit: number; balance: number }) => {
    const before = e.balance - e.debit + e.credit;
    const paid = partySide === "debtor" ? e.credit : partySide === "creditor" ? e.debit : 0;
    const owed = partySide === "debtor" ? before : -before;
    return paid > 0 && owed > 0 ? { pct: (paid / owed) * 100, owed } : null;
  };
  const billed = partySide === "debtor" ? Math.max(openingBalance, 0) + totalDr : Math.max(-openingBalance, 0) + totalCr;
  const paidTotal = partySide === "debtor" ? totalCr : totalDr;
  const due = partySide === "debtor" ? closingBalance : -closingBalance;
  const pct = (n: number) => (billed > 0 ? `${((n / billed) * 100).toFixed(1)}%` : "—");

  return (
    <Shell active="ledger">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 no-print">
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
            {/* Printed for the party: just whose ledger it is and for which
                period, like the Oracle ACCOUNTS LEDGER. The code / level card
                below took half the page and stays on screen only. */}
            <div className="hidden print:flex items-baseline justify-between gap-4 mb-3 border-b-2 border-black pb-1">
              <div className="text-[15px] font-bold uppercase">{accountInfo.description}</div>
              <div className="mono text-[11px] whitespace-nowrap">
                {dmy(dateFrom)} — {dmy(dateTo)}
              </div>
            </div>
            <div className="border border-black p-6 mb-6 no-print">
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
                        {billHref(entry) ? (
                          <a href={billHref(entry)!} target="_blank" rel="noopener" className="underline underline-offset-2 print:no-underline" title="Open the Pakki Parchi bill">
                            {entry.vtype}-{entry.vno}
                          </a>
                        ) : (
                          <>{entry.vtype}-{entry.vno}</>
                        )}
                      </td>
                      <td className="text-[var(--muted)]">{entry.narration}</td>
                      <td className="text-center no-print">
                        {!entry.img && billHref(entry) ? (
                          <a href={billHref(entry)!} target="_blank" rel="noopener" className="mono text-[11px] font-semibold underline underline-offset-2">
                            BILL
                          </a>
                        ) : (
                          <ImageLinks value={entry.img} />
                        )}
                      </td>
                      <td className="mono text-right">
                        {entry.debit > 0 ? formatNum(entry.debit) : ""}
                        {partySide === "creditor" && paymentShare(entry) && (
                          <div className="text-[10px] text-[var(--muted)] whitespace-nowrap no-print">
                            {paymentShare(entry)!.pct.toFixed(1)}% of {formatNum(paymentShare(entry)!.owed)}
                          </div>
                        )}
                      </td>
                      <td className="mono text-right">
                        {entry.credit > 0 ? formatNum(entry.credit) : ""}
                        {partySide === "debtor" && paymentShare(entry) && (
                          <div className="text-[10px] text-[var(--muted)] whitespace-nowrap no-print">
                            {paymentShare(entry)!.pct.toFixed(1)}% of {formatNum(paymentShare(entry)!.owed)}
                          </div>
                        )}
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
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black">
                    <td colSpan={4} className="font-bold text-[13px] uppercase tracking-[0.05em]">
                      Closing Balance ({dateTo})
                    </td>
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
                  {partySide && billed > 0 && (
                    <tr>
                      <td colSpan={8} className="pt-3">
                        <div className="text-[12px] flex flex-wrap gap-x-5 gap-y-1 mono">
                          <span>
                            {partySide === "debtor" ? "Billed" : "Payable"} <b>{formatNum(billed)}</b>
                          </span>
                          <span>
                            {partySide === "debtor" ? "Received" : "Paid"} <b>{formatNum(paidTotal)}</b> ({pct(paidTotal)})
                          </span>
                          <span>
                            Still due <b>{formatNum(Math.max(due, 0))}</b> ({pct(Math.max(due, 0))})
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 border border-black" style={{ maxWidth: 420 }}>
                          <div className="h-full bg-black" style={{ width: `${Math.min(100, (paidTotal / billed) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
