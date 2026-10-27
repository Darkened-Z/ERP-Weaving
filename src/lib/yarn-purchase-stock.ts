import { db, schema } from "@/db";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PurchaseLine = { batchNo: string | null; count: string | null; lbs: number | null };
export class PurchaseStockError extends Error {
  constructor(readonly stock: string, readonly sold: number, readonly reason: "removed" | "short") {
    super(`Purchase is required by existing sales: ${stock}`);
  }
}

/** Run inside the purchase edit/delete write transaction, before changing rows. */
export async function assertYarnPurchaseStock(tx: Tx, voucherId: number, incoming: PurchaseLine[]) {
  const prior = await tx.select({ batchNo: schema.extYarnPurVoucherLine.batchNo, count: schema.extYarnPurVoucherLine.count })
    .from(schema.extYarnPurVoucherLine).where(eq(schema.extYarnPurVoucherLine.voucherId, voucherId));
  const batches = [...new Set(prior.map(p => p.batchNo).filter((b): b is string => !!b))];
  if (batches.length) {
    const sold = await tx.select({ batch: schema.extYarnSalVoucherLine.batchNo, lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)` })
      .from(schema.extYarnSalVoucherLine).where(inArray(schema.extYarnSalVoucherLine.batchNo, batches)).groupBy(schema.extYarnSalVoucherLine.batchNo);
    for (const s of sold) {
      if (!s.batch || s.lbs <= 0) continue;
      const replacements = incoming.filter(l => l.batchNo === s.batch);
      if (!replacements.length) throw new PurchaseStockError(s.batch, s.lbs, "removed");
      if (replacements.reduce((sum, l) => sum + (l.lbs ?? 0), 0) + 0.01 < s.lbs) throw new PurchaseStockError(s.batch, s.lbs, "short");
      // A sold batch must not be moved to a different count by an edit.
      if (replacements.some(l => l.count !== prior.find(p => p.batchNo === s.batch)?.count)) throw new PurchaseStockError(s.batch, s.lbs, "removed");
    }
  }
  const counts = [...new Set(prior.map(p => p.count).filter((c): c is string => !!c))];
  if (!counts.length) return;
  const otherPurchases = await tx.select({ count: schema.extYarnPurVoucherLine.count, lbs: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs}), 0)` })
    .from(schema.extYarnPurVoucherLine).where(and(inArray(schema.extYarnPurVoucherLine.count, counts), ne(schema.extYarnPurVoucherLine.voucherId, voucherId))).groupBy(schema.extYarnPurVoucherLine.count);
  const sales = await tx.select({ count: schema.extYarnSalVoucherLine.count, lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)` })
    .from(schema.extYarnSalVoucherLine).where(inArray(schema.extYarnSalVoucherLine.count, counts)).groupBy(schema.extYarnSalVoucherLine.count);
  const others = new Map(otherPurchases.map(p => [p.count, p.lbs]));
  for (const sale of sales) {
    if (!sale.count || sale.lbs <= 0) continue;
    const supply = (others.get(sale.count) ?? 0) + incoming.filter(l => l.count === sale.count).reduce((s, l) => s + (l.lbs ?? 0), 0);
    if (supply + 0.01 < sale.lbs) throw new PurchaseStockError(`count ${sale.count}`, sale.lbs, "short");
  }
}
