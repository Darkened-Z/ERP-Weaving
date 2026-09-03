import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

/**
 * The DEBTORS - CONVERSION WVG head, returned as a "code." prefix: **1.01.01.01** ONLY
 * (owner: inventory conversion pickers must show ONLY this head's parties, no other).
 * Used by the grey-conversion contract, beam-ext-ws converter party, and the
 * yarn-receipt delivered-from party so they all behave identically.
 */
export async function conversionDebtorPrefixes(): Promise<string[]> {
  const heads = await db
    .select({ code: schema.chartOfAccounts.code })
    .from(schema.chartOfAccounts)
    .where(
      sql`${schema.chartOfAccounts.level} = 4 AND upper(${schema.chartOfAccounts.description}) LIKE '%CONVERSION%WVG%'`,
    );
  return heads.map((h) => String(h.code) + ".");
}

/** True when `code` sits under any of the given "code." prefixes. */
export function underAnyPrefix(code: string, prefixes: string[]): boolean {
  return prefixes.some((p) => code.startsWith(p));
}
