import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

/**
 * DEBTORS - CONVERSION heads, returned as "code." prefixes: **WVG `1.01.01.01`**
 * AND **COMMERCIAL `1.01.01.19`** (owner: inventory conversion pickers show both,
 * so real conversion parties like "Sami sab conv 2026" — which live under
 * COMMERCIAL — are selectable). Used by the grey-conversion contract, beam-ext-ws
 * converter party, and the yarn-receipt delivered-from party so all behave alike.
 */
export async function conversionDebtorPrefixes(): Promise<string[]> {
  const heads = await db
    .select({ code: schema.chartOfAccounts.code })
    .from(schema.chartOfAccounts)
    .where(
      sql`${schema.chartOfAccounts.level} = 4 AND ${schema.chartOfAccounts.code} LIKE '1.01.01.%' AND upper(${schema.chartOfAccounts.description}) LIKE '%CONVERSION%' AND (upper(${schema.chartOfAccounts.description}) LIKE '%WVG%' OR upper(${schema.chartOfAccounts.description}) LIKE '%COMMERCIAL%')`,
    );
  return heads.map((h) => String(h.code) + ".");
}

/** True when `code` sits under any of the given "code." prefixes. */
export function underAnyPrefix(code: string, prefixes: string[]): boolean {
  return prefixes.some((p) => code.startsWith(p));
}
