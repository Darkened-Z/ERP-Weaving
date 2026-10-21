import { db, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Every account's ledger balance today (debit − credit over all posted lines),
 * the same figure the General Ledger closes on. Voucher screens show the
 * picked party's balance from this, as the Oracle forms did.
 */
export async function accountBalances(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      code: schema.transDetail.accCode,
      bal: sql<number>`coalesce(sum(${schema.transDetail.debit}), 0) - coalesce(sum(${schema.transDetail.credit}), 0)`,
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
    .groupBy(schema.transDetail.accCode);
  const out: Record<string, number> = {};
  for (const r of rows) if (Math.abs(Number(r.bal)) >= 0.005) out[r.code] = Math.round(Number(r.bal) * 100) / 100;
  return out;
}
