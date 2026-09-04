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
      vno: schema.transDetail.vno,
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

  // Distinct-voucher tallies per cheque no — a bounced cheque can be RE-ISSUED
  // under the same number, so status compares counts instead of mere existence:
  // clear present → Cleared; more issues than bounces → Issued (active again);
  // otherwise a bounce ended it → Returned.
  const advClear = new Set<string>();
  const advBounce = new Set<string>();
  const issueVnos = new Map<string, Set<number>>();
  const bounceVnos = new Map<string, Set<number>>();
  for (const l of lines) {
    const chq = (l.chqNo ?? "").trim();
    if (!chq || l.vtype !== "ADV") continue;
    if (l.trnType === "CLEAR") advClear.add(chq);
    if (l.trnType === "BOUNCE") {
      advBounce.add(chq);
      (bounceVnos.get(chq) ?? bounceVnos.set(chq, new Set()).get(chq)!).add(l.vno);
    }
    if (l.trnType === "ISSUE") {
      (issueVnos.get(chq) ?? issueVnos.set(chq, new Set()).get(chq)!).add(l.vno);
    }
  }

  const reg = new Map<string, ChequeEntry>();
  for (const l of lines) {
    const chq = (l.chqNo ?? "").trim();
    if (!chq || !OUTGOING.has(l.vtype)) continue;
    if (l.vtype === "ADV" && (l.trnType === "CLEAR" || l.trnType === "BOUNCE")) continue; // reversal, not origin
    const amount = (l.debit ?? 0) + (l.credit ?? 0);
    const existing = reg.get(chq);
    if (existing && existing.amount >= amount) continue;
    const issues = issueVnos.get(chq)?.size ?? 0;
    const bounces = bounceVnos.get(chq)?.size ?? 0;
    const derived: ChequeDerived = advClear.has(chq)
      ? "Cleared"
      : issues > bounces
        ? "Issued"
        : advBounce.has(chq)
          ? "Returned"
          : "Issued";
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
