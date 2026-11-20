import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/**
 * What the masters have closed, keyed the way the counts reports key rows
 * (party NAME + yarn count CODE):
 *  - a party whose Chart of Accounts status is C;
 *  - one count of a party whose Party Count row has status C.
 * Party Count stores the yarn count's id and the party's account code, so both
 * are translated here.
 */
export async function closedPartyCounts() {
  const [accounts, counts, partyCounts] = await Promise.all([
    db.select({ code: schema.chartOfAccounts.code, name: schema.chartOfAccounts.description, status: schema.chartOfAccounts.status }).from(schema.chartOfAccounts),
    db.select({ id: schema.yarnCounts.id, code: schema.yarnCounts.countCode }).from(schema.yarnCounts),
    db.select({ party: schema.partyCounts.partyCode, count: schema.partyCounts.countCode }).from(schema.partyCounts).where(eq(schema.partyCounts.status, "C")),
  ]);
  const nameByCode = new Map(accounts.map((a) => [a.code, norm(a.name)]));
  const countById = new Map(counts.map((c) => [c.id, norm(c.code)]));
  const parties = new Set(accounts.filter((a) => norm(a.status) === "C").map((a) => norm(a.name)));
  const pairs = new Set(
    partyCounts.map((p) => `${nameByCode.get(p.party) ?? ""}||${countById.get(p.count) ?? ""}`),
  );
  return {
    parties,
    isClosed: (party: string, count?: string) =>
      parties.has(norm(party)) || (count != null && pairs.has(`${norm(party)}||${norm(count)}`)),
  };
}
