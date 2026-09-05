import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Shared godown / party-count helpers used by the yarn receipt, yarn transfer
 * and warped-beam pages (and any future page that needs the same lookups).
 * Pure functions take the parties the page already fetched; the async helper
 * runs its own query.
 */

export type CoaParty = { code: string | number; description: string };

/** COA code of the yarn-stock godown (GODOWN - YARN STOCK (WVG)). */
export const YARN_STOCK_GODOWN_CODE = "1.01.25.01.0001";

/**
 * The yarn-stock godown's description, resolved by CODE first — the description
 * regex alone lands on GODOWN - REWINDER YARN STOCK, which sorts before
 * GODOWN - YARN STOCK (WVG).
 */
export function yarnStockGodownDesc(parties: CoaParty[]): string {
  return (
    parties.find((p) => String(p.code) === YARN_STOCK_GODOWN_CODE)?.description ??
    parties.find((p) => /godown/i.test(p.description) && /yarn\s*stock/i.test(p.description))?.description ??
    ""
  );
}

/**
 * Every GODOWN account (code under 1.01.25.01), as Combobox options
 * (value = description). Location pickers on yarn receipt / yarn transfer are
 * godowns only — sizing and CHQ-FAILED accounts (1.01.15.04, 3.03.06.02, …) are
 * intentionally excluded, so the filter is by CODE, never by a "godown|sizing"
 * name match (which used to pull in every "…SIZING" party).
 */
export function godownLocationOpts(parties: CoaParty[]): { value: string; label: string }[] {
  return parties
    .filter((p) => String(p.code).startsWith("1.01.25.01."))
    .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
}

/**
 * Rate/Lbs per (party, count): the party_counts rate, keyed
 * "<party description>||<count code>" for the PartyCountRate client component
 * (count joined via yarn_counts.id → its text code).
 */
export async function partyCountRateMap(parties: CoaParty[]): Promise<Record<string, number>> {
  const descByCode = new Map(parties.map((p) => [String(p.code), p.description]));
  const rows = await db
    .select({
      partyCode: schema.partyCounts.partyCode,
      countCode: schema.yarnCounts.countCode,
      rate: schema.partyCounts.ratePerLbs,
    })
    .from(schema.partyCounts)
    .leftJoin(schema.yarnCounts, eq(schema.partyCounts.countCode, schema.yarnCounts.id));
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (!r.countCode || r.rate == null) continue;
    map[`${descByCode.get(r.partyCode) ?? r.partyCode}||${r.countCode}`] = r.rate;
  }
  return map;
}
