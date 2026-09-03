import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

/**
 * The level-4 DEBTORS conversion heads, returned as "code." prefixes:
 *   1.01.01.01  DEBITORS - CONVERSION WVG
 *   1.01.01.19  DEBITORS - CONVERSION (COMMERCIAL)
 * Every conversion party lives under one of these, so party pickers that should
 * offer "conversion parties" filter on the union — used by the grey-conversion
 * contract, beam-ext-ws converter party, and the yarn-receipt delivered-from party
 * so they all behave identically.
 */
export async function conversionDebtorPrefixes(): Promise<string[]> {
  const heads = await db
    .select({ code: schema.chartOfAccounts.code })
    .from(schema.chartOfAccounts)
    .where(
      sql`${schema.chartOfAccounts.level} = 4 AND ${schema.chartOfAccounts.code} LIKE '1.01.01.%' AND upper(${schema.chartOfAccounts.description}) LIKE '%CONVERSION%'`,
    );
  return heads.map((h) => String(h.code) + ".");
}

/** True when `code` sits under any of the given "code." prefixes. */
export function underAnyPrefix(code: string, prefixes: string[]): boolean {
  return prefixes.some((p) => code.startsWith(p));
}
