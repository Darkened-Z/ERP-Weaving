import { db, schema } from "@/db";
import { and, eq, isNotNull } from "drizzle-orm";

// Outgoing cheques only — these consume your own cheque-book leaves.
const OUTGOING = new Set(["ADV", "BP", "CP"]);
const TITLE: Record<string, ChequeDisplay> = {
  STOPPED: "Stopped",
  CANCELED: "Canceled",
  MISSED: "Missed",
  ISSUED: "Issued",
};

export type ChequeDerived = "Issued" | "Cleared" | "Returned";
export type ChequeDisplay = ChequeDerived | "Stopped" | "Canceled" | "Missed";
export type ChequeEntry = {
  chqNo: string;
  chqDate: string;
  payee: string;
  amount: number;
  vtype: string;
  derived: ChequeDerived;
  eff: ChequeDisplay; // derived, overridden by a manual status while still "Issued"
};

/**
 * Build the outgoing-cheque register keyed by cheque number, from voucher lines
 * (`trans_detail.chq_no`). One entry per cheque, taken from its "origin" line
 * (ADV ISSUE / BP / CP — never the ADV CLEAR/BOUNCE reversal). GL clear/bounce
 * set Cleared/Returned; a manual override (STOPPED/CANCELED/MISSED) applies only
 * while the derived status is still Issued.
 */
export async function loadChequeRegister(
  descMap: Map<string, string>,
): Promise<Map<string, ChequeEntry>> {
  const lines = await db
    .select({
      chqNo: schema.transDetail.chqNo,
      chqDate: schema.transDetail.chqDate,
      vtype: schema.transDetail.vtype,
      vdate: schema.transMain.vdate,
      trnType: schema.transMain.trnType,
      accCode: schema.transDetail.accCode,
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
    .where(isNotNull(schema.transDetail.chqNo));

  const advClear = new Set<string>();
  const advBounce = new Set<string>();
  for (const l of lines) {
    const chq = (l.chqNo ?? "").trim();
    if (!chq || l.vtype !== "ADV") continue;
    if (l.trnType === "CLEAR") advClear.add(chq);
    if (l.trnType === "BOUNCE") advBounce.add(chq);
  }

  const reg = new Map<string, ChequeEntry>();
  for (const l of lines) {
    const chq = (l.chqNo ?? "").trim();
    if (!chq || !OUTGOING.has(l.vtype)) continue;
    if (l.vtype === "ADV" && (l.trnType === "CLEAR" || l.trnType === "BOUNCE")) continue; // reversal, not origin
    const amount = (l.debit ?? 0) + (l.credit ?? 0);
    const existing = reg.get(chq);
    if (existing && existing.amount >= amount) continue;
    const derived: ChequeDerived = advBounce.has(chq) ? "Returned" : advClear.has(chq) ? "Cleared" : "Issued";
    reg.set(chq, {
      chqNo: chq,
      chqDate: (l.chqDate ?? l.vdate ?? "").trim(),
      payee: descMap.get(l.accCode) ?? l.accCode,
      amount,
      vtype: l.vtype,
      derived,
      eff: derived,
    });
  }

  const overrides = await db.select().from(schema.chequeStatus);
  const ovMap = new Map(overrides.map((o) => [o.chqNo, o.status]));
  for (const e of reg.values()) {
    if (e.derived === "Issued") e.eff = TITLE[ovMap.get(e.chqNo) ?? ""] ?? "Issued";
  }
  return reg;
}
