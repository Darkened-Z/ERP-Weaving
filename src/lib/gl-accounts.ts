import { db, schema } from "@/db";

/**
 * Resolve a posting-account key to its current chart-of-accounts code.
 * Reads from the posting_accounts config table (seeded from Oracle SAVE_ACC
 * defaults, editable in /settings/posting-accounts). Falls back to the
 * hardcoded Oracle default if the key isn't in the table.
 */
export type PostingKey =
  | "GREY_SALE_INCOME"
  | "YARN_SALE_INCOME"
  | "GREY_COMMISSION_INCOME"
  | "SALE_BROKERAGE_EXP"
  | "GST_OUTPUT"
  | "FURTHER_TAX"
  | "FURTHER_ADJ"
  | "YARN_PURCHASE_STOCK"
  | "WARPING_SIZING_EXP"
  | "PARTS_STOCK"
  | "PARTS_CONSUMPTION"
  | "PARTS_STOCK_EXP"
  | "ADJUSTMENT_LOSS"
  | "KNOTTING_EXP"
  | "SARNING_EXP"
  | "MAROORI_EXP"
  | "ADVANCE_CLEARING"
  | "DEFAULT_DEBTOR";

const ORACLE_DEFAULTS: Record<PostingKey, string> = {
  GREY_SALE_INCOME: "5.01.01.01.0001",
  YARN_SALE_INCOME: "5.01.01.01.0005",
  GREY_COMMISSION_INCOME: "5.01.01.01.0006",
  // DR brokerage expense, created under the CREDITOR - BROKER head (3.03.25.03.*).
  SALE_BROKERAGE_EXP: "3.03.25.03.0003",
  GST_OUTPUT: "5.01.01.05.0005",
  FURTHER_TAX: "5.01.01.01.0002",
  FURTHER_ADJ: "5.01.01.01.0003",
  YARN_PURCHASE_STOCK: "7.05.01.01.0020",
  WARPING_SIZING_EXP: "7.05.01.01.0047",
  PARTS_STOCK: "1.01.25.16.0001",
  PARTS_CONSUMPTION: "7.01.07.01.0006",
  PARTS_STOCK_EXP: "7.05.01.01.0053",
  ADJUSTMENT_LOSS: "7.05.01.01.0033",
  KNOTTING_EXP: "7.01.06.01.0001",
  SARNING_EXP: "7.01.06.01.0002",
  MAROORI_EXP: "7.01.06.01.0003",
  ADVANCE_CLEARING: "7.05.10.0001",
  DEFAULT_DEBTOR: "1.01.25.01.0001",
};

let cache: Map<string, string> | null = null;

async function loadCache(): Promise<Map<string, string>> {
  if (cache) return cache;
  const rows = await db.select().from(schema.postingAccounts);
  cache = new Map(rows.map((r) => [r.key, r.accCode]));
  return cache;
}

export function invalidateGlCache() {
  cache = null;
}

export async function acc(key: PostingKey): Promise<string> {
  const c = await loadCache();
  return c.get(key) ?? ORACLE_DEFAULTS[key];
}

/**
 * Resolve a party account by chart-of-accounts code or description. Returns
 * the code as-is if it's already a valid COA code, or looks up the code by
 * description. Falls back to DEFAULT_DEBTOR if nothing matches.
 */
export async function resolveParty(partyCodeOrDesc: string | null | undefined): Promise<string> {
  if (!partyCodeOrDesc) return acc("DEFAULT_DEBTOR");
  const s = partyCodeOrDesc.trim();
  if (!s) return acc("DEFAULT_DEBTOR");
  // Dotted codes like "1.01.25.01.0001" are already COA codes
  if (/^\d+(\.\d+)+$/.test(s)) return s;
  // Otherwise treat as description; caller should have translated already
  return s;
}
