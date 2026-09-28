import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { resolveFyCode } from "@/lib/period-lock";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The fiscal year a voucher belongs to is decided by its DATE, not by whatever
 * year the company profile currently points at — otherwise editing a voucher
 * from a closed year re-posts it into the open one.
 */
export async function fyCodeForDate(vDate: string): Promise<string> {
  return (await resolveFyCode(vDate)) ?? "";
}

/**
 * Removes a voucher's ledger rows. Pass `fyCode` whenever the voucher number is
 * only unique inside a fiscal year (store GRN / demand / return restart every
 * year); omit it for numbers that are unique across years (LV numbers), so a
 * voucher whose date moved between years is still cleared from the old one.
 */
export async function clearVoucher(
  tx: Tx | typeof db,
  vtype: string,
  vno: number,
  fyCode?: string | null,
): Promise<void> {
  const d = fyCode
    ? and(eq(schema.transDetail.vtype, vtype), eq(schema.transDetail.vno, vno), eq(schema.transDetail.fyCode, fyCode))
    : and(eq(schema.transDetail.vtype, vtype), eq(schema.transDetail.vno, vno));
  const m = fyCode
    ? and(eq(schema.transMain.vtype, vtype), eq(schema.transMain.vno, vno), eq(schema.transMain.fyCode, fyCode))
    : and(eq(schema.transMain.vtype, vtype), eq(schema.transMain.vno, vno));
  await tx.delete(schema.transDetail).where(d);
  await tx.delete(schema.transMain).where(m);
}
