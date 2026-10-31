import { db } from "@/db";
import { sql } from "drizzle-orm";
import { addDays } from "@/lib/time";
import type { PendingAdvanceCheque } from "@/lib/advance-cheque-forecast";

export type CashSide = "RECEIVABLE" | "PAYABLE";
export type CashStage = "OPEN" | "CONFIRMED" | "ON_HOLD";
export type CashParty = { side: CashSide; code: string; name: string; outstanding: number };
export type CashPlan = {
  side: CashSide;
  accCode: string;
  expectedDate: string | null;
  expectedAmount: number | null;
  stage: CashStage;
  notes: string | null;
};

export async function ensureCashFlowPlans() {
  await db.run(sql`CREATE TABLE IF NOT EXISTS cash_flow_plans (
    side TEXT NOT NULL,
    acc_code TEXT NOT NULL,
    expected_date TEXT,
    expected_amount REAL,
    stage TEXT NOT NULL DEFAULT 'OPEN',
    notes TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    PRIMARY KEY (side, acc_code)
  )`);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function cashFlowBoard(parties: CashParty[], plans: CashPlan[], cashBalance: number, asOf: string, cheques: PendingAdvanceCheque[] = []) {
  const byKey = new Map(plans.map((p) => [`${p.side}|${p.accCode}`, p]));
  const rows = parties.filter((p) => p.outstanding > 0.005).map((party) => {
    const plan = byKey.get(`${party.side}|${party.code}`);
    const scheduled = plan?.expectedDate && plan.stage !== "ON_HOLD"
      ? Math.min(party.outstanding, Math.max(0, plan.expectedAmount ?? party.outstanding))
      : 0;
    return { ...party, plan, scheduled, unscheduled: Math.max(0, party.outstanding - scheduled) };
  });
  const sum = (side: CashSide, selector: (row: (typeof rows)[number]) => number) =>
    rows.filter((r) => r.side === side).reduce((a, r) => a + selector(r), 0);
  const dueBy = (side: CashSide, through: string) => sum(side, (r) =>
    r.plan?.expectedDate && r.plan.expectedDate <= through ? r.scheduled : 0);
  const seven = addDays(asOf, 7);
  const thirty = addDays(asOf, 30);
  const receipts7 = dueBy("RECEIVABLE", seven);
  const payments7 = dueBy("PAYABLE", seven);
  const receipts30 = dueBy("RECEIVABLE", thirty);
  const payments30 = dueBy("PAYABLE", thirty);
  const chequesBy = (through: string) => cheques.reduce((sum, cheque) =>
    cheque.chqDate && cheque.chqDate <= through ? sum + cheque.amount : sum, 0);
  const cheques7 = chequesBy(seven);
  const cheques30 = chequesBy(thirty);
  return {
    rows,
    cashBalance,
    receivables: sum("RECEIVABLE", (r) => r.outstanding),
    payables: sum("PAYABLE", (r) => r.outstanding),
    unscheduledReceivables: sum("RECEIVABLE", (r) => r.unscheduled),
    unscheduledPayables: sum("PAYABLE", (r) => r.unscheduled),
    receipts7, payments7, receipts30, payments30,
    cheques7, cheques30,
    pendingCheques: cheques.reduce((sum, cheque) => sum + cheque.amount, 0),
    undatedCheques: cheques.filter((cheque) => !cheque.chqDate).reduce((sum, cheque) => sum + cheque.amount, 0),
    projected7: cashBalance + receipts7 - payments7 - cheques7,
    projected30: cashBalance + receipts30 - payments30 - cheques30,
    overdueReceivables: dueBy("RECEIVABLE", addDays(asOf, -1)),
    overduePayables: dueBy("PAYABLE", addDays(asOf, -1)),
  };
}
