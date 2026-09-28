import { db, schema } from "@/db";
import { and, eq, ne, sql } from "drizzle-orm";

/**
 * Yarn lying at a location, per count: receipts into it (RCPT − RETN), plus
 * transfers in, less transfers out. `excludeTransferId` leaves one transfer
 * out, so an edit is checked against the stock without its own old quantity.
 */
export async function yarnStockAt(
  location: string,
  excludeTransferId?: number,
): Promise<Map<string, { bags: number; lbs: number }>> {
  const out = new Map<string, { bags: number; lbs: number }>();
  const add = (count: string | null, bags: number, lbs: number) => {
    if (!count) return;
    const cur = out.get(count) ?? { bags: 0, lbs: 0 };
    cur.bags += bags;
    cur.lbs += lbs;
    out.set(count, cur);
  };

  const rcpt = await db
    .select({
      countCode: schema.intYarnReceipt.countCode,
      bags: sql<number>`COALESCE(SUM(CASE WHEN ${schema.intYarnReceipt.trnType}='RETN' THEN -${schema.intYarnReceipt.bags} ELSE ${schema.intYarnReceipt.bags} END),0)`,
      lbs: sql<number>`COALESCE(SUM(CASE WHEN ${schema.intYarnReceipt.trnType}='RETN' THEN -${schema.intYarnReceipt.qtyLbs} ELSE ${schema.intYarnReceipt.qtyLbs} END),0)`,
    })
    .from(schema.intYarnReceipt)
    .where(eq(schema.intYarnReceipt.yarnPartyTo, location))
    .groupBy(schema.intYarnReceipt.countCode);
  for (const r of rcpt) add(r.countCode, Number(r.bags ?? 0), Number(r.lbs ?? 0));

  const notThis = excludeTransferId ? ne(schema.intYarnTransfer.id, excludeTransferId) : undefined;
  const tIn = await db
    .select({
      countCode: schema.intYarnTransfer.countCode,
      bags: sql<number>`COALESCE(SUM(${schema.intYarnTransfer.qtyBags}),0)`,
      lbs: sql<number>`COALESCE(SUM(${schema.intYarnTransfer.qtyLbs}),0)`,
    })
    .from(schema.intYarnTransfer)
    .where(and(eq(schema.intYarnTransfer.locationTo, location), notThis))
    .groupBy(schema.intYarnTransfer.countCode);
  for (const r of tIn) add(r.countCode, Number(r.bags ?? 0), Number(r.lbs ?? 0));

  const tOut = await db
    .select({
      countCode: schema.intYarnTransfer.countCode,
      bags: sql<number>`COALESCE(SUM(${schema.intYarnTransfer.qtyBags}),0)`,
      lbs: sql<number>`COALESCE(SUM(${schema.intYarnTransfer.qtyLbs}),0)`,
    })
    .from(schema.intYarnTransfer)
    .where(and(eq(schema.intYarnTransfer.locationFrom, location), notThis))
    .groupBy(schema.intYarnTransfer.countCode);
  for (const r of tOut) add(r.countCode, -Number(r.bags ?? 0), -Number(r.lbs ?? 0));

  for (const v of out.values()) {
    v.bags = Math.round(v.bags * 100) / 100;
    v.lbs = Math.round(v.lbs * 100) / 100;
  }
  return out;
}
