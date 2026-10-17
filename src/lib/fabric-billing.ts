import { db, schema } from "@/db";
import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

// Conversion billing off the looms (owner 2026-10): metres woven in the range
// per contract × the contract's rate per metre (conv rate, else pick × rate/
// pick). One source for Fabric Production & Billing and Weaving Income, so the
// income on the P/L is always the billing report's total.

export type BillingFilter = {
  from: string;
  to: string;
  /** None = every shed. */
  sheds: string[];
  loom?: number;
  /** Contract status R / C; empty = all. */
  status?: string;
  party?: string;
};

export type BillingRow = {
  contNo: string;
  quality: string;
  construction: string;
  party: string;
  designNo: string;
  production: number;
  pick: number;
  ratePerPick: number;
  rate: number;
  amount: number;
};

export async function shedList() {
  const loomSheds = await db.selectDistinct({ shed: schema.looms.shed }).from(schema.looms);
  return [...new Set(["1", "2", "3", "4", ...loomSheds.map((l) => l.shed.trim()).filter(Boolean)])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

export async function loadFabricBilling(f: BillingFilter) {
  const conds: SQL[] = [gte(schema.intDailyProduction.vDate, f.from), lte(schema.intDailyProduction.vDate, f.to)];
  if (f.sheds.length) conds.push(inArray(schema.intDailyProduction.shedNo, f.sheds));
  if (f.loom != null && Number.isFinite(f.loom)) conds.push(eq(schema.intDailyProductionSet.loomNo, f.loom));

  const contractNo = sql<string | null>`coalesce(nullif(${schema.intDailyProductionSet.contNo}, ''), ${schema.beams.contractNo})`;
  const prod = await db
    .select({
      contNo: contractNo,
      vDate: schema.intDailyProduction.vDate,
      m: sql<number>`coalesce(sum(${schema.intDailyProductionSet.totalCount}), 0)`,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
    .leftJoin(schema.beams, eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo))
    .where(and(...conds))
    .groupBy(sql`1`, schema.intDailyProduction.vDate);

  // Every status: a contract completed since still bills what it wove in range.
  const cols = <T extends typeof schema.intGreyConversionContract | typeof schema.extGreyConvContract>(t: T) => ({
    id: t.id,
    contNo: t.contNo,
    party: t.party,
    productName: t.productName,
    productQuality: t.productQuality,
    designNo: t.designNo,
    pick: t.pick,
    ratePerPick: t.ratePerPick,
    convRatePerMtr: t.convRatePerMtr,
    status: t.status,
  });
  const [intC, extC, intWarp, intWeft, extWarp, extWeft] = await Promise.all([
    db.select(cols(schema.intGreyConversionContract)).from(schema.intGreyConversionContract),
    db.select(cols(schema.extGreyConvContract)).from(schema.extGreyConvContract),
    db.select({ id: schema.intGreyConversionWarp.contractId, d: schema.intGreyConversionWarp.descr }).from(schema.intGreyConversionWarp).orderBy(schema.intGreyConversionWarp.srNo),
    db.select({ id: schema.intGreyConversionWeft.contractId, d: schema.intGreyConversionWeft.descr }).from(schema.intGreyConversionWeft).orderBy(schema.intGreyConversionWeft.srNo),
    db.select({ id: schema.extGreyConvWarp.contractId, d: schema.extGreyConvWarp.descr }).from(schema.extGreyConvWarp).orderBy(schema.extGreyConvWarp.srNo),
    db.select({ id: schema.extGreyConvWeft.contractId, d: schema.extGreyConvWeft.descr }).from(schema.extGreyConvWeft).orderBy(schema.extGreyConvWeft.srNo),
  ]);
  const descrs = (rows: { id: number; d: string | null }[]) => {
    const m = new Map<number, string[]>();
    for (const r of rows) if (r.d?.trim()) m.set(r.id, [...(m.get(r.id) ?? []), r.d.trim()]);
    return m;
  };
  const construction = (warp: Map<number, string[]>, weft: Map<number, string[]>, id: number) =>
    [warp.get(id)?.join(" + "), weft.get(id)?.join(" + ")].filter(Boolean).join(" BY ");
  const [iwp, iwf, ewp, ewf] = [descrs(intWarp), descrs(intWeft), descrs(extWarp), descrs(extWeft)];
  const contracts = new Map(
    [
      ...intC.map((c) => ({ ...c, construction: construction(iwp, iwf, c.id) })),
      ...extC.map((c) => ({ ...c, construction: construction(ewp, ewf, c.id) })),
    ].map((c) => [c.contNo, c]),
  );

  const rateOf = (c: { pick: number | null; ratePerPick: number | null; convRatePerMtr: number | null } | undefined) =>
    c ? (c.convRatePerMtr ?? (c.pick ?? 0) * (c.ratePerPick ?? 0)) : 0;

  const party = f.party?.trim() || "";
  const status = (f.status?.trim() || "").toUpperCase();
  const parties = [...new Set(prod.map((r) => (r.contNo ? contracts.get(r.contNo)?.party?.trim() : "") || "").filter(Boolean))].sort();
  const inParty = (contNo: string | null) => !party || (contNo ? contracts.get(contNo)?.party?.trim() === party : false);
  const inStatus = (contNo: string | null) => !status || (contNo ? (contracts.get(contNo)?.status ?? "").toUpperCase() === status : false);

  const byContract = new Map<string, number>();
  const byDay = new Map<string, { m: number; a: number }>();
  for (const r of prod) {
    const m = Number(r.m);
    if (!(m > 0) || !inParty(r.contNo) || !inStatus(r.contNo)) continue;
    const k = r.contNo ?? "";
    byContract.set(k, (byContract.get(k) ?? 0) + m);
    const d = byDay.get(r.vDate) ?? { m: 0, a: 0 };
    d.m += m;
    d.a += m * rateOf(contracts.get(k));
    byDay.set(r.vDate, d);
  }

  const rows: BillingRow[] = [...byContract.entries()]
    .map(([contNo, production]) => {
      const c = contracts.get(contNo);
      const rate = rateOf(c);
      return {
        contNo: contNo || "—",
        quality: c?.productName || c?.productQuality || "—",
        construction: c?.construction ?? "",
        party: c?.party ?? "",
        designNo: c?.designNo ?? "",
        production,
        pick: c?.pick ?? 0,
        ratePerPick: c?.ratePerPick ?? 0,
        rate,
        amount: production * rate,
      };
    })
    // Oracle prints the smallest production first.
    .sort((a, b) => a.production - b.production);
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const production = rows.reduce((s, r) => s + r.production, 0);
  const amount = rows.reduce((s, r) => s + r.amount, 0);
  const wAvg = (g: (r: BillingRow) => number) => (production ? rows.reduce((s, r) => s + g(r) * r.production, 0) / production : 0);
  const totals = {
    production,
    amount,
    pick: wAvg((r) => r.pick),
    ratePerPick: wAvg((r) => r.ratePerPick),
    rate: production ? amount / production : 0,
  };
  return { rows, days, totals, parties };
}
