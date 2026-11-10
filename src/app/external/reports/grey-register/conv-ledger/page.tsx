import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { DateBox } from "@/components/date-box";
import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { today as todayIso, monthsAgo } from "@/lib/time";
import { loadConvLedger, CONV_LEDGER_FINANCE_TYPES as FINANCE_TYPES } from "@/lib/conv-ledger";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);


export default async function GreyRegisterConvLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ party?: string; from?: string; to?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || monthsAgo(12);
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";

  const [partyRows, accounts, financePartyCodes, godownParties] = await Promise.all([
    db
      .selectDistinct({ party: schema.extPackiParchi.saleParty })
      .from(schema.extPackiParchi)
      .where(sql`${schema.extPackiParchi.convRate} IS NOT NULL AND ${schema.extPackiParchi.convRate} > 0`),
    db
      .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts),
    db
      .selectDistinct({ accCode: schema.transDetail.accCode })
      .from(schema.transDetail)
      .where(
        and(
          inArray(schema.transDetail.vtype, [...FINANCE_TYPES]),
          sql`${schema.transDetail.accCode} LIKE '1.01.01.%'`,
        ),
      ),
    db
      .selectDistinct({ party: schema.extGodownStock.purchaseParty })
      .from(schema.extGodownStock)
      .where(eq(schema.extGodownStock.type, "STOCK")),
  ]);
  const codeByDesc = new Map(accounts.map((a) => [(a.description ?? "").trim(), a.code]));
  const descByCode = new Map(accounts.map((a) => [a.code, (a.description ?? "").trim()]));
  const ppParties = new Set(partyRows.map((r) => (r.party ?? "").trim()).filter(Boolean));
  for (const r of financePartyCodes) {
    const desc = descByCode.get(r.accCode ?? "");
    if (desc && !ppParties.has(desc)) ppParties.add(desc);
  }
  // Creditors who supply grey (their lots come from Grey Purchase In Stock, not Pakki Parchi).
  for (const r of godownParties) {
    const desc = (r.party ?? "").trim();
    if (desc && codeByDesc.get(desc)?.startsWith("3.03.")) ppParties.add(desc);
  }
  const partyOpts = Array.from(ppParties).sort().map((v) => ({ value: v, label: v }));
  const partyCoa = party
    ? /^\d+(\.\d+)+$/.test(party)
      ? party
      : codeByDesc.get(party) ?? ""
    : "";

  const rows = await loadConvLedger(party, partyCoa, from, to);
  const running = rows[rows.length - 1]?.balance ?? 0;

  const total = rows.reduce(
    (t, r) => ({ than: t.than + r.than, mtr: t.mtr + r.mtr, dr: t.dr + r.dr, cr: t.cr + r.cr }),
    { than: 0, mtr: 0, dr: 0, cr: 0 },
  );

  const excelRows = rows.map((r) => ({
    date: r.date,
    vno: r.vno,
    convCont: r.convCont,
    saleCont: r.saleCont,
    narration: r.narration,
    than: r.than,
    mtr: r.mtr,
    rate: r.rate,
    dr: Math.round(r.dr),
    cr: Math.round(r.cr),
    balance: Math.round(r.balance),
  }));

  return (
    <Shell active="ext-r-grey-conv-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Grey Register &mdash; Conversion Ledger</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {party || "pick a party"} &middot; {rows.length} lines &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <PrintButton label="Print" />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "date", label: "Date" },
                { key: "vno", label: "V.#" },
                { key: "convCont", label: "Conv Cont #" },
                { key: "saleCont", label: "Sale Cont #" },
                { key: "narration", label: "Narration" },
                { key: "than", label: "Than" },
                { key: "mtr", label: "Mtr" },
                { key: "rate", label: "Conv. Rate" },
                { key: "dr", label: "Dr" },
                { key: "cr", label: "Cr" },
                { key: "balance", label: "Balance" },
              ]}
              filename="grey-register-conv-ledger"
              title={`Grey Register - Conversion Ledger - ${party}`}
            />
          </div>
        </div>

        <form method="GET" className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end no-print">
          <div className="sm:col-span-5">
            <label className="label block mb-1">Conversion Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="Select party..." />
          </div>
          <div className="sm:col-span-3">
            <label className="label block mb-1">Date From</label>
            <DateBox name="from" className="input-box mono" defaultValue={from} />
          </div>
          <div className="sm:col-span-3">
            <label className="label block mb-1">Date To</label>
            <DateBox name="to" className="input-box mono" defaultValue={to} />
          </div>
          <div className="sm:col-span-1">
            <button type="submit" className="btn btn-sm w-full">View</button>
          </div>
        </form>

        <p className="sm:hidden no-print text-[11px] text-[var(--muted)] mb-2">Swipe sideways to see all ledger columns.</p>
        <div className="card overflow-x-auto">
          <table className="min-w-[850px] sm:min-w-[1150px]">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Date</th>
                <th style={{ width: 80 }}>V.#</th>
                <th className="hidden sm:table-cell" style={{ width: 80 }}>Conv Cont #</th>
                <th className="hidden sm:table-cell" style={{ width: 80 }}>Sale Cont #</th>
                <th>Narration</th>
                <th className="hidden sm:table-cell text-right" style={{ width: 60 }}>Than</th>
                <th className="text-right whitespace-nowrap" style={{ width: 100 }}>Mtr</th>
                <th className="text-right whitespace-nowrap" style={{ width: 90 }}>Conv. Rate</th>
                <th className="text-right" style={{ width: 90 }}>Dr</th>
                <th className="text-right" style={{ width: 90 }}>Cr</th>
                <th className="text-right" style={{ width: 100 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-[13px] text-[var(--muted)] py-8">
                    {party ? "No conversion or payment entries for this party in the period." : "Pick a conversion party above."}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.vno}-${i}`}>
                    <td className="mono text-[11px] sm:text-[12px]">{r.date}</td>
                    <td className="mono text-[11px] sm:text-[12px] font-bold">
                      {r.href ? (
                        <a href={r.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 print:no-underline" title={r.kind === "PP" ? "Open the conversion bill" : "Open the grey purchase voucher"}>{r.vno}</a>
                      ) : r.vno}
                    </td>
                    <td className="hidden sm:table-cell mono text-[12px]">{r.convCont}</td>
                    <td className="hidden sm:table-cell mono text-[12px]">{r.saleCont}</td>
                    <td className="text-[11px] sm:text-[12px] max-w-[120px] sm:max-w-none truncate">{r.narration}</td>
                    <td className="hidden sm:table-cell mono text-right">{r.than ? fmt(r.than) : ""}</td>
                    <td className="mono text-right whitespace-nowrap text-[11px] sm:text-[13px]">{r.kind !== "FIN" ? fmt2(r.mtr) : ""}</td>
                    <td className="mono text-right whitespace-nowrap text-[11px] sm:text-[13px]">{r.rate ? fmt2(r.rate) : ""}</td>
                    <td className="mono text-right text-[11px] sm:text-[13px]">{r.dr ? fmt(r.dr) : ""}</td>
                    <td className="mono text-right text-[11px] sm:text-[13px]">{r.cr ? fmt(r.cr) : ""}</td>
                    <td className="mono text-right font-semibold text-[11px] sm:text-[13px]">
                      {fmt(Math.abs(r.balance))}{" "}
                      <span className="text-[10px] text-[var(--muted)]">{r.balance >= 0 ? "Dr" : "Cr"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black">
                  <td colSpan={2} className="font-bold text-[11px] sm:text-[12px] uppercase tracking-[0.05em]">
                    Closing ({to})
                  </td>
                  <td className="hidden sm:table-cell" />
                  <td className="hidden sm:table-cell" />
                  <td />
                  <td className="hidden sm:table-cell mono text-right font-bold">{fmt(total.than)}</td>
                  <td className="mono text-right whitespace-nowrap font-bold">{fmt2(total.mtr)}</td>
                  <td />
                  <td className="mono text-right font-bold">{fmt(total.dr)}</td>
                  <td className="mono text-right font-bold">{fmt(total.cr)}</td>
                  <td className="mono text-right font-bold">
                    {fmt(Math.abs(running))}{" "}
                    <span className="text-[10px] text-[var(--muted)]">{running >= 0 ? "Dr" : "Cr"}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
