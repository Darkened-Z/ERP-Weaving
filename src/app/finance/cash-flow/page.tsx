import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { acc } from "@/lib/gl-accounts";
import { cashFlowBoard, ensureCashFlowPlans, isIsoDate, type CashParty, type CashPlan, type CashSide, type CashStage } from "@/lib/cash-flow";
import { pendingAdvanceCheques } from "@/lib/advance-cheque-forecast";
import { today } from "@/lib/time";
import { and, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
const BASE = "/finance/cash-flow";
const fmt = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

async function savePlan(formData: FormData) {
  "use server";
  const actor = await requireSession();
  const side = String(formData.get("side") ?? "") as CashSide;
  const code = String(formData.get("code") ?? "").trim();
  const date = String(formData.get("expected_date") ?? "").trim();
  const amountText = String(formData.get("expected_amount") ?? "").trim();
  const stage = String(formData.get("stage") ?? "OPEN") as CashStage;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);
  const prefix = side === "PAYABLE" ? "3.03." : side === "RECEIVABLE" ? "1.01.01." : "";
  if (!prefix || !code.startsWith(prefix) || (date && !isIsoDate(date)) || !["OPEN", "CONFIRMED", "ON_HOLD"].includes(stage)) {
    redirect(`${BASE}?error=invalid`);
  }
  const amount = amountText ? Number(amountText) : null;
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 1e12)) redirect(`${BASE}?error=invalid`);
  const [party] = await db.select({ code: schema.chartOfAccounts.code })
    .from(schema.chartOfAccounts)
    .where(and(eq(schema.chartOfAccounts.code, code), gte(schema.chartOfAccounts.level, 5)))
    .limit(1);
  if (!party) redirect(`${BASE}?error=invalid`);
  const [balance] = await db.select({
    debit: sql<number>`coalesce(sum(${schema.transDetail.debit}), 0)`,
    credit: sql<number>`coalesce(sum(${schema.transDetail.credit}), 0)`,
  }).from(schema.transDetail).innerJoin(schema.transMain, and(
    eq(schema.transDetail.fyCode, schema.transMain.fyCode),
    eq(schema.transDetail.vtype, schema.transMain.vtype),
    eq(schema.transDetail.vno, schema.transMain.vno),
  )).where(and(eq(schema.transDetail.accCode, code), lte(schema.transMain.vdate, today())));
  const outstanding = side === "PAYABLE"
    ? Number(balance?.credit ?? 0) - Number(balance?.debit ?? 0)
    : Number(balance?.debit ?? 0) - Number(balance?.credit ?? 0);
  if (outstanding <= 0.005 || (amount !== null && amount > outstanding + 0.005)) redirect(`${BASE}?error=invalid`);

  await ensureCashFlowPlans();
  if (!date && amount === null && !notes && stage === "OPEN") {
    await db.delete(schema.cashFlowPlans).where(and(eq(schema.cashFlowPlans.side, side), eq(schema.cashFlowPlans.accCode, code)));
  } else {
    await db.insert(schema.cashFlowPlans).values({
      side, accCode: code, expectedDate: date || null, expectedAmount: amount,
      stage, notes: notes || null, updatedAt: new Date().toISOString(), updatedBy: actor.login,
    }).onConflictDoUpdate({ target: [schema.cashFlowPlans.side, schema.cashFlowPlans.accCode], set: {
      expectedDate: date || null, expectedAmount: amount, stage, notes: notes || null,
      updatedAt: new Date().toISOString(), updatedBy: actor.login,
    } });
  }
  revalidatePath(BASE);
  redirect(`${BASE}?saved=1`);
}

export default async function CashFlowPage({ searchParams }: {
  searchParams: Promise<{ side?: string; q?: string; saved?: string; error?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const asOf = today();
  await ensureCashFlowPlans();

  const [partyRows, savedPlans, cashAccount, advanceLines] = await Promise.all([
    db.select({
      code: schema.transDetail.accCode,
      name: schema.chartOfAccounts.description,
      net: sql<number>`sum(case when ${schema.transDetail.accCode} like '3.03.%'
        then ${schema.transDetail.credit} - ${schema.transDetail.debit}
        else ${schema.transDetail.debit} - ${schema.transDetail.credit} end)`,
    }).from(schema.transDetail)
      .innerJoin(schema.transMain, and(
        eq(schema.transDetail.fyCode, schema.transMain.fyCode),
        eq(schema.transDetail.vtype, schema.transMain.vtype),
        eq(schema.transDetail.vno, schema.transMain.vno),
      ))
      .innerJoin(schema.chartOfAccounts, eq(schema.transDetail.accCode, schema.chartOfAccounts.code))
      .where(and(lte(schema.transMain.vdate, asOf), gte(schema.chartOfAccounts.level, 5),
        or(like(schema.transDetail.accCode, "3.03.%"), like(schema.transDetail.accCode, "1.01.01.%"))))
      .groupBy(schema.transDetail.accCode, schema.chartOfAccounts.description),
    db.select().from(schema.cashFlowPlans),
    acc("CASH_IN_HAND"),
    db.select({
      fyCode: schema.transDetail.fyCode,
      vno: schema.transDetail.vno,
      srno: schema.transDetail.srno,
      accCode: schema.transDetail.accCode,
      chqNo: schema.transDetail.chqNo,
      chqDate: schema.transDetail.chqDate,
      trnType: schema.transMain.trnType,
      debit: schema.transDetail.debit,
      credit: schema.transDetail.credit,
    }).from(schema.transDetail).innerJoin(schema.transMain, and(
      eq(schema.transDetail.fyCode, schema.transMain.fyCode),
      eq(schema.transDetail.vtype, schema.transMain.vtype),
      eq(schema.transDetail.vno, schema.transMain.vno),
    )).where(and(eq(schema.transDetail.vtype, "ADV"),
      like(schema.transDetail.accCode, "1.01.15.03.%"), lte(schema.transMain.vdate, asOf))),
  ]);
  const parties: CashParty[] = partyRows.map((r) => ({
    side: r.code.startsWith("3.03.") ? "PAYABLE" : "RECEIVABLE",
    code: r.code, name: r.name, outstanding: Number(r.net ?? 0),
  }));
  const plans: CashPlan[] = savedPlans.map((p) => ({
    side: p.side as CashSide, accCode: p.accCode, expectedDate: p.expectedDate,
    expectedAmount: p.expectedAmount, stage: p.stage as CashStage, notes: p.notes,
  }));
  const cashRows = await db.select({
    code: schema.transDetail.accCode,
    name: schema.chartOfAccounts.description,
    balance: sql<number>`sum(${schema.transDetail.debit} - ${schema.transDetail.credit})`,
  }).from(schema.transDetail)
    .innerJoin(schema.transMain, and(
      eq(schema.transDetail.fyCode, schema.transMain.fyCode),
      eq(schema.transDetail.vtype, schema.transMain.vtype),
      eq(schema.transDetail.vno, schema.transMain.vno),
    ))
    .innerJoin(schema.chartOfAccounts, eq(schema.transDetail.accCode, schema.chartOfAccounts.code))
    .where(and(lte(schema.transMain.vdate, asOf), gte(schema.chartOfAccounts.level, 5),
      or(eq(schema.transDetail.accCode, cashAccount), like(schema.transDetail.accCode, "1.01.11.02.%"),
        like(schema.transDetail.accCode, "1.01.15.02.%"))))
    .groupBy(schema.transDetail.accCode, schema.chartOfAccounts.description);
  const cashBalance = cashRows.reduce((sum, r) => sum + Number(r.balance ?? 0), 0);
  const board = cashFlowBoard(parties, plans, cashBalance, asOf, pendingAdvanceCheques(advanceLines));
  const sideFilter = params.side === "PAYABLE" || params.side === "RECEIVABLE" ? params.side : "ALL";
  const query = (params.q ?? "").trim().toLowerCase();
  const rows = board.rows.filter((r) => (sideFilter === "ALL" || r.side === sideFilter) &&
    (!query || r.name.toLowerCase().includes(query) || r.code.toLowerCase().includes(query)))
    .sort((a, b) => (a.plan?.expectedDate ?? "9999").localeCompare(b.plan?.expectedDate ?? "9999") ||
      b.outstanding - a.outstanding);

  const card = (label: string, value: number, detail: string) => (
    <div className="bg-white p-4 min-w-0">
      <div className={`stat-value text-[20px] break-all ${value < 0 ? "text-red-700" : ""}`}>{fmt(value)}</div>
      <div className="stat-label">{label}</div>
      <div className="text-[11px] text-[var(--muted)] mt-1">{detail}</div>
    </div>
  );

  return <Shell active="fin-cash-flow"><div className="animate-in">
    <div className="mb-6">
      <h1 className="page-title">Cash Flow &amp; Payment Workflow</h1>
      <p className="text-[13px] text-[var(--muted)] mt-2">As of {asOf} · posted ledger balances update automatically when payments or receipts are saved.</p>
    </div>
    {params.saved === "1" && <p className="mb-4 p-3 border border-green-700 text-green-800">Plan saved.</p>}
    {params.error && <p className="mb-4 p-3 border border-red-700 text-red-800">Check the party, amount, date and status before saving.</p>}
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-black border border-black mb-4">
      {card("Cash & bank now", board.cashBalance, "Posted cash and bank ledgers")}
      {card("To receive", board.receivables, "Open debtor balances")}
      {card("To pay", board.payables, "Open creditor balances")}
      {card("7-day forecast", board.projected7, `+${fmt(board.receipts7)} receipts / -${fmt(board.payments7)} plans / -${fmt(board.cheques7)} cheques`)}
      {card("30-day forecast", board.projected30, `+${fmt(board.receipts30)} receipts / -${fmt(board.payments30)} plans / -${fmt(board.cheques30)} cheques`)}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6 text-[13px]">
      <div className="border p-3 bg-white">Needs collection date: <b>{fmt(board.unscheduledReceivables)}</b></div>
      <div className="border p-3 bg-white">Needs payment date: <b>{fmt(board.unscheduledPayables)}</b></div>
      <div className="border p-3 bg-white">Overdue plan: <b>{fmt(board.overdueReceivables)} to receive · {fmt(board.overduePayables)} to pay</b></div>
      <a href="/finance/advance-cheque" className="border p-3 bg-white underline">Uncleared advance cheques: <b>{fmt(board.pendingCheques)}</b>{board.undatedCheques > 0 && <span className="block text-[11px]">No cheque date: {fmt(board.undatedCheques)}</span>}</a>
    </div>
    <p className="text-[12px] text-[var(--muted)] mb-5">The forecast uses dated, open plans and uncleared advance cheques, including overdue cheques. On hold plans and undated cheques are excluded. Each plan is capped at the party’s current ledger balance. This tracks the next expected settlement per party; update it after each installment. Dates and notes here do not post or alter accounting vouchers.</p>
    <div className="flex flex-wrap gap-2 mb-5 no-print">
      <a className="btn btn-sm" href="/finance/br">Record bank receipt</a>
      <a className="btn btn-sm" href="/finance/cr">Record cash receipt</a>
      <a className="btn btn-sm" href="/finance/bp">Record bank payment</a>
      <a className="btn btn-sm" href="/finance/cp">Record cash payment</a>
      <a className="btn btn-sm" href="/reports/cash-book">Cash &amp; bank book</a>
    </div>
    <form method="GET" className="flex flex-wrap items-end gap-3 mb-4 no-print">
      <label className="text-[12px]">Type<select name="side" className="input-box block mt-1" defaultValue={sideFilter}>
        <option value="ALL">All</option><option value="RECEIVABLE">To receive</option><option value="PAYABLE">To pay</option>
      </select></label>
      <label className="text-[12px]">Party<input name="q" className="input-box block mt-1" defaultValue={params.q ?? ""} placeholder="Name or account code" /></label>
      <button className="btn btn-sm" type="submit">View</button>
    </form>
    <div className="section-title">Open party balances ({rows.length})</div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px]">
      <thead><tr><th>Type / Party</th><th className="text-right">Outstanding</th><th className="text-right">Plan amount</th><th>Expected date</th><th>Stage</th><th>Follow-up note</th><th>Action</th></tr></thead>
      <tbody>{rows.map((r) => {
        const formId = `cash-plan-${r.side}-${r.code.replace(/\W/g, "-")}`;
        return <tr key={`${r.side}|${r.code}`}>
          <td><span className={`text-[10px] font-bold ${r.side === "PAYABLE" ? "text-red-700" : "text-blue-700"}`}>{r.side === "PAYABLE" ? "TO PAY" : "TO RECEIVE"}</span><br />
            <a href={`/ledger?account=${encodeURIComponent(r.code)}`} className="font-semibold underline">{r.name}</a><br />
            <span className="mono text-[11px] text-[var(--muted)]">{r.code}</span></td>
          <td className="mono text-right font-semibold">{fmt(r.outstanding)}</td>
          <td><input form={formId} name="expected_amount" type="number" min="0.01" step="0.01" className="input-box w-32 text-right" aria-label={`Planned amount for ${r.name}`} defaultValue={r.plan?.expectedAmount != null ? Math.min(r.plan.expectedAmount, r.outstanding) : ""} placeholder={fmt(r.outstanding)} /></td>
          <td><input form={formId} name="expected_date" type="date" className="input-box" aria-label={`Expected date for ${r.name}`} defaultValue={r.plan?.expectedDate ?? ""} /></td>
          <td><select form={formId} name="stage" className="input-box" aria-label={`Follow-up stage for ${r.name}`} defaultValue={r.plan?.stage ?? "OPEN"}>
            <option value="OPEN">Follow up</option><option value="CONFIRMED">Confirmed</option><option value="ON_HOLD">On hold</option>
          </select></td>
          <td><input form={formId} name="notes" maxLength={500} className="input-box w-52" aria-label={`Follow-up note for ${r.name}`} defaultValue={r.plan?.notes ?? ""} placeholder="Next action / contact" /></td>
          <td><form id={formId} action={savePlan}><input type="hidden" name="side" value={r.side} /><input type="hidden" name="code" value={r.code} /><button className="btn btn-sm" type="submit" aria-label={`Save cash plan for ${r.name}`}>Save</button></form></td>
        </tr>;
      })}
      {rows.length === 0 && <tr><td colSpan={7} className="text-center text-[var(--muted)] py-8">No open party balances match this filter.</td></tr>}
      </tbody>
    </table></div>
  </div></Shell>;
}
