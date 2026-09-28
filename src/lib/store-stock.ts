import { db, schema } from "@/db";
import { and, inArray, lt } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Call inside a store transaction after its stock updates. Taking a GRN,
 * return or adjustment back out after the parts were already issued would
 * leave stock (and the PARTS_STOCK ledger) below zero; this throws instead,
 * so the whole transaction rolls back. The message is NEG_STOCK:<part code>.
 */
export async function assertStockNotNegative(tx: Tx, partCodes: (string | null | undefined)[]): Promise<void> {
  const codes = Array.from(new Set(partCodes.filter((c): c is string => !!c)));
  if (!codes.length) return;
  const [bad] = await tx
    .select({ code: schema.chartParts.code })
    .from(schema.chartParts)
    .where(and(inArray(schema.chartParts.code, codes), lt(schema.chartParts.currentStock, 0)))
    .limit(1);
  if (bad) throw new Error(`NEG_STOCK:${bad.code}`);
}

/** The part code from a NEG_STOCK error, or null for any other error. */
export function negStockPart(e: unknown): string | null {
  const m = /NEG_STOCK:(.+)/.exec(String((e as { message?: string })?.message ?? ""));
  return m ? m[1] : null;
}
