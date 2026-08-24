import { db, schema } from "@/db";
import { and, eq, inArray, lte } from "drizzle-orm";

type Module = "FINANCE" | "INVENTORY" | "STORE";

async function resolveFyCode(vDate: string): Promise<string | null> {
  const fys = await db
    .select({
      code: schema.fiscalYears.code,
      startDate: schema.fiscalYears.startDate,
      endDate: schema.fiscalYears.endDate,
    })
    .from(schema.fiscalYears);
  const hit = fys.find((f) => f.startDate <= vDate && vDate <= f.endDate);
  if (hit) return hit.code;
  const [cp] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  return cp?.currentFy ?? null;
}

export async function isPeriodLocked(vDate: string, module: Module): Promise<boolean> {
  if (!vDate) return false;
  const fyCode = await resolveFyCode(vDate);
  const rows = fyCode
    ? await db
        .select({
          lockedThrough: schema.periodLocks.lockedThrough,
          module: schema.periodLocks.module,
        })
        .from(schema.periodLocks)
        .where(
          and(
            eq(schema.periodLocks.fyCode, fyCode),
            inArray(schema.periodLocks.module, [module, "ALL"]),
            lte(schema.periodLocks.lockedThrough, "9999-12-31"),
          ),
        )
    : await db
        .select({
          lockedThrough: schema.periodLocks.lockedThrough,
          module: schema.periodLocks.module,
        })
        .from(schema.periodLocks)
        .where(inArray(schema.periodLocks.module, [module, "ALL"]));
  return rows.some((r) => vDate <= r.lockedThrough);
}

export async function lockedThrough(vDate: string, module: Module): Promise<string | null> {
  if (!vDate) return null;
  const fyCode = await resolveFyCode(vDate);
  const rows = fyCode
    ? await db
        .select({
          lockedThrough: schema.periodLocks.lockedThrough,
        })
        .from(schema.periodLocks)
        .where(
          and(
            eq(schema.periodLocks.fyCode, fyCode),
            inArray(schema.periodLocks.module, [module, "ALL"]),
          ),
        )
    : await db
        .select({
          lockedThrough: schema.periodLocks.lockedThrough,
        })
        .from(schema.periodLocks)
        .where(inArray(schema.periodLocks.module, [module, "ALL"]));
  const hits = rows.filter((r) => vDate <= r.lockedThrough).map((r) => r.lockedThrough);
  if (hits.length === 0) return null;
  return hits.sort().reverse()[0];
}

export async function assertPeriodOpen(vDate: string, module: Module): Promise<void> {
  const thru = await lockedThrough(vDate, module);
  if (thru) {
    throw new Error(`Period locked through ${thru}`);
  }
}

export function parseLockedThroughFromError(msg: string): string | null {
  const m = /Period locked through (\d{4}-\d{2}-\d{2})/.exec(msg);
  return m ? m[1] : null;
}
