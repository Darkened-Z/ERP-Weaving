import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { DateBox } from "@/components/date-box";
import { db, schema } from "@/db";
import { and, eq, lte, or } from "drizzle-orm";
import { today as todayIso } from "@/lib/time";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

const daysBetween = (from: string, to: string) => {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
};

/**
 * ACCOUNTS AGING, the detailed one.
 *
 * The bucket report answers "how much is 30 to 60 days old". This answers the
 * question that follows it: WHICH entries, and how old is each. Every open
 * voucher on a party is listed with its date, its narration, its age in days
 * and a running accumulation, closing on the party's balance — which is how the
 * mill's own CREDITORS ACCOUNTS AGING reads.
 *
 * Creditors are the credit side (what the mill owes), debtors the debit side.
 * One implementation, because the two differ only in which column carries the
 * money and which head the parties come from.
 */
export async function AgingDetailReport({
  searchParams,
  side,
  title,
  navKey,
}: {
  searchParams: Promise<{
    asof?: string;
    party?: string;
    code?: string;
    short?: string;
    mode?: string;
    summary?: string;
  }>;
  side: "CR" | "DB";
  title: string;
  navKey: string;
}) {
  await requireSession();
  const p = await searchParams;
  const asOf = p.asof?.trim() || todayIso();
  const partyFilter = p.party?.trim() ?? "";
  const codeFilter = p.code?.trim() ?? "";
  const shortFilter = p.short?.trim() ?? "";
  // Summary drops the vouchers and leaves one line per account — the same
  // switch the mill's own screen carries.
  const summaryOnly = p.summary === "1";

  const accounts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts);
  const nameByCode = new Map(accounts.map((a) => [a.code, a.description ?? a.code]));

  // Creditors sit under TRADE CREDITORS, debtors under TRADE DEBITORS.
  const prefix = side === "CR" ? "3.03." : "1.01.01.";
  const partyCodes = accounts
    .filter((a) => (a.level ?? 0) >= 5 && (a.code ?? "").startsWith(prefix))
    .map((a) => a.code);

  const rows = partyCodes.length
    ? await db
        .select({
          accCode: schema.transDetail.accCode,
          vtype: schema.transDetail.vtype,
          vno: schema.transDetail.vno,
          vdate: schema.transMain.vdate,
          dueDate: schema.transMain.dueDate,
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
        .where(
          and(
            lte(schema.transMain.vdate, asOf),
            or(...partyCodes.map((c) => eq(schema.transDetail.accCode, c))),
          ),
        )
    : [];

  type Line = {
    vno: number;
    vtype: string;
    vdate: string;
    dueDate: string;
    narration: string;
    amount: number;
    accum: number;
    days: number;
  };

  const shortByCode = new Map(accounts.map((a) => [a.code, (a.descShort ?? "").trim()]));
  const byParty = new Map<string, typeof rows>();
  for (const r of rows) {
    const name = nameByCode.get(r.accCode) ?? r.accCode;
    if (partyFilter && !name.toLowerCase().includes(partyFilter.toLowerCase())) continue;
    if (codeFilter && !r.accCode.startsWith(codeFilter)) continue;
    if (shortFilter && !(shortByCode.get(r.accCode) ?? "").toLowerCase().includes(shortFilter.toLowerCase()))
      continue;
    (byParty.get(r.accCode) ?? byParty.set(r.accCode, []).get(r.accCode)!).push(r);
  }

  const parties = Array.from(byParty.entries())
    .map(([code, all]) => {
      const sorted = [...all].sort((a, b) => (a.vdate ?? "").localeCompare(b.vdate ?? ""));
      // The money column is the side the party's balance sits on; the other
      // side is a settlement and reduces what is outstanding.
      const signed = sorted.map((r) =>
        side === "CR" ? (r.credit ?? 0) - (r.debit ?? 0) : (r.debit ?? 0) - (r.credit ?? 0),
      );
      const lines = sorted.reduce<Line[]>((acc, r, i) => {
        const amount = signed[i];
        if (amount === 0) return acc;
        const accum = (acc[acc.length - 1]?.accum ?? 0) + amount;
        acc.push({
          vno: r.vno,
          vtype: r.vtype,
          vdate: r.vdate ?? "",
          dueDate: r.dueDate ?? "",
          narration: (r.narration ?? "").trim(),
          amount,
          accum,
          days: daysBetween(r.vdate ?? asOf, asOf),
        });
        return acc;
      }, []);
      const closing = lines[lines.length - 1]?.accum ?? 0;
      return { code, name: nameByCode.get(code) ?? code, lines, closing };
    })
    // A party that has settled to nothing is not aging.
    .filter((x) => x.lines.length > 0 && Math.abs(x.closing) > 0.01)
    .sort((a, b) => a.name.localeCompare(b.name));

  const grand = parties.reduce((s, x) => s + x.closing, 0);
  const moneyLabel = side === "CR" ? "CR" : "DR";

  const excelRows = parties.flatMap((pt) =>
    pt.lines.map((l) => ({
      party: pt.name,
      vno: l.vno,
      vtype: l.vtype,
      narration: l.narration,
      amount: Math.round(l.amount),
      date: l.vdate,
      due: l.dueDate,
      accum: Math.round(l.accum),
      days: l.days,
    })),
  );

  return (
    <Shell active={navKey}>
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Aging upto {asOf} &middot; {parties.length} account{parties.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <PrintButton label="Print" />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "party", label: "Account" },
                { key: "vno", label: "V.No" },
                { key: "vtype", label: "VT" },
                { key: "narration", label: "Narration" },
                { key: "amount", label: moneyLabel },
                { key: "date", label: "Date" },
                { key: "due", label: "Due Date" },
                { key: "accum", label: "Accum. Amt" },
                { key: "days", label: "Days" },
              ]}
              filename={side === "CR" ? "creditors-aging-detail" : "debtors-aging-detail"}
              title={title}
            />
          </div>
        </div>

        <form method="GET" className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end no-print">
          <div className="sm:col-span-3">
            <label className="label block mb-1">Aging Upto Date</label>
            <DateBox name="asof" className="input-box mono" defaultValue={asOf} />
          </div>
          <div className="sm:col-span-3">
            <label className="label block mb-1">Tittle</label>
            <input
              name="party"
              list="aging-parties"
              className="input-box mono"
              defaultValue={partyFilter}
              placeholder="All parties"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label block mb-1">Short Tittle</label>
            <input name="short" className="input-box mono" defaultValue={shortFilter} placeholder="any" />
          </div>
          <div className="sm:col-span-2">
            <label className="label block mb-1">Code</label>
            <input name="code" className="input-box mono" defaultValue={codeFilter} placeholder={prefix} />
          </div>
          <div className="sm:col-span-1 flex items-center gap-1 pb-1">
            <input
              type="checkbox"
              id="aging-summary"
              name="summary"
              value="1"
              defaultChecked={summaryOnly}
            />
            <label htmlFor="aging-summary" className="label">Summary</label>
          </div>
          <div className="sm:col-span-1">
            <button type="submit" className="btn btn-sm w-full">View</button>
          </div>
        </form>
        <datalist id="aging-parties">
          {Array.from(new Set(rows.map((r) => nameByCode.get(r.accCode) ?? r.accCode)))
            .sort()
            .map((n) => (
              <option key={n} value={n} />
            ))}
        </datalist>

        {parties.length === 0 ? (
          <div className="card px-4 py-10 text-center text-[13px] text-[var(--muted)] italic">
            Nothing outstanding as at {asOf}.
          </div>
        ) : (
          parties.map((pt) => (
            <div key={pt.code} className="card mb-5" style={{ breakInside: "avoid" }}>
              <div className="px-3 py-1.5 border-b-2 border-black font-bold text-[13px]">
                {pt.name}
                <span className="ml-2 mono text-[11px] text-[var(--muted)]">{pt.code}</span>
              </div>
              {summaryOnly ? null : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>V.NO</th>
                      <th style={{ width: 50 }}>VT</th>
                      <th>NARRATION</th>
                      <th className="text-right" style={{ width: 110 }}>{moneyLabel}</th>
                      <th style={{ width: 90 }}>DATE</th>
                      <th style={{ width: 90 }}>Due DATE</th>
                      <th className="text-right" style={{ width: 120 }}>ACCUM. AMT</th>
                      <th className="text-right" style={{ width: 60 }}>DAYS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pt.lines.map((l, i) => (
                      <tr key={`${l.vtype}-${l.vno}-${i}`}>
                        <td className="mono font-bold">{l.vno}</td>
                        <td className="mono">{l.vtype}</td>
                        <td className="text-[12px]">{l.narration}</td>
                        <td className="mono text-right">{fmt(l.amount)}</td>
                        <td className="mono text-[12px]">{l.vdate}</td>
                        <td className="mono text-[12px]">{l.dueDate}</td>
                        <td className="mono text-right">{fmt(l.accum)}</td>
                        <td className="mono text-right font-semibold">{l.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
              {/* The closing figure is the thing anyone wants to go behind, so
                  it opens that account's full ledger rather than being a dead
                  number at the foot of a list. */}
              <a
                href={`/ledger?account=${encodeURIComponent(pt.code)}&to=${asOf}`}
                className="flex justify-between items-baseline px-3 py-2 border-t-2 border-black hover:bg-yellow-50"
                title="Open this account's ledger"
              >
                <span className="font-bold text-[12px] uppercase tracking-[0.05em] underline">
                  Closing Balance
                </span>
                <span className="mono text-[15px] font-bold">{fmt(pt.closing)}</span>
              </a>
            </div>
          ))
        )}

        {parties.length > 0 && (
          <div className="card px-4 py-3 flex justify-between items-baseline border-2 border-black">
            <span className="font-bold text-[13px] uppercase tracking-[0.06em]">Closing Balance</span>
            <span className="mono text-[17px] font-bold">{fmt(grand)}</span>
          </div>
        )}
      </div>
    </Shell>
  );
}
