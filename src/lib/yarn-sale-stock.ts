import { db, schema } from "@/db";
import { and, inArray, ne, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SaleLine = { batchNo: string | null; count: string | null; lbs: number | null };
const round2 = (n: number) => Math.round(n * 100) / 100;

export class YarnStockError extends Error {
  constructor(readonly stock: string, readonly available: number, readonly wanted: number) {
    super(`Insufficient yarn: ${stock}`);
  }
}

/** Must run inside the same write transaction as the sale insert/update. */
export async function assertYarnSaleStock(tx: Tx, lines: SaleLine[], voucherId?: number) {
  const batches = [...new Set(lines.map(l => l.batchNo).filter((b): b is string => !!b))];
  const purchases = batches.length ? await tx.select({
    batchNo: schema.extYarnPurVoucherLine.batchNo,
    count: schema.extYarnPurVoucherLine.count,
    lbs: schema.extYarnPurVoucherLine.lbs,
  }).from(schema.extYarnPurVoucherLine).where(inArray(schema.extYarnPurVoucherLine.batchNo, batches)) : [];
  const countOfBatch = new Map(purchases.map(p => [p.batchNo, p.count]));
  const wantedBatch = new Map<string, number>();
  const wantedCount = new Map<string, number>();
  for (const line of lines) {
    const lbs = line.lbs ?? 0;
    if (line.batchNo) wantedBatch.set(line.batchNo, (wantedBatch.get(line.batchNo) ?? 0) + lbs);
    // Use the purchased batch's count, not an editable/stale form value.
    const count = line.batchNo ? countOfBatch.get(line.batchNo) : line.count;
    if (count) wantedCount.set(count, (wantedCount.get(count) ?? 0) + lbs);
  }
  if (batches.length) {
    const sold = await tx.select({
      batchNo: schema.extYarnSalVoucherLine.batchNo,
      lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)`,
    }).from(schema.extYarnSalVoucherLine).where(and(
      inArray(schema.extYarnSalVoucherLine.batchNo, batches),
      voucherId ? ne(schema.extYarnSalVoucherLine.voucherId, voucherId) : undefined,
    )).groupBy(schema.extYarnSalVoucherLine.batchNo);
    const purchased = new Map<string, number>();
    for (const p of purchases) if (p.batchNo) purchased.set(p.batchNo, (purchased.get(p.batchNo) ?? 0) + (p.lbs ?? 0));
    const soldBy = new Map(sold.map(s => [s.batchNo, s.lbs]));
    for (const [batch, wanted] of wantedBatch) {
      const available = round2((purchased.get(batch) ?? 0) - (soldBy.get(batch) ?? 0));
      if (wanted > available + 0.01) throw new YarnStockError(batch, available, round2(wanted));
    }
  }
  // Every sale also consumes the count, including older sales without a batch.
  const counts = [...wantedCount.keys()];
  if (!counts.length) return;
  const purchased = await tx.select({
    count: schema.extYarnPurVoucherLine.count,
    lbs: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs}), 0)`,
  }).from(schema.extYarnPurVoucherLine).where(inArray(schema.extYarnPurVoucherLine.count, counts)).groupBy(schema.extYarnPurVoucherLine.count);
  const sold = await tx.select({
    count: schema.extYarnSalVoucherLine.count,
    lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)`,
  }).from(schema.extYarnSalVoucherLine).where(and(
    inArray(schema.extYarnSalVoucherLine.count, counts),
    voucherId ? ne(schema.extYarnSalVoucherLine.voucherId, voucherId) : undefined,
  )).groupBy(schema.extYarnSalVoucherLine.count);
  const purBy = new Map(purchased.map(p => [p.count, p.lbs]));
  const soldBy = new Map(sold.map(s => [s.count, s.lbs]));
  for (const [count, wanted] of wantedCount) {
    const available = round2((purBy.get(count) ?? 0) - (soldBy.get(count) ?? 0));
    if (wanted > available + 0.01) throw new YarnStockError(`count ${count}`, available, round2(wanted));
  }
}
