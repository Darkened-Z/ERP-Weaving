import { db, schema } from "@/db";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { escLike } from "@/lib/form";
import { countLabelMap } from "@/lib/grey-quality";
import { today as todayFn, monthsAgo } from "@/lib/time";

/**
 * The Yarn Register reports (Count, Register/Party, Count Avg) read the yarn
 * purchase and sale VOUCHER lines — the yarn that actually moved — the way the
 * Oracle Yarn Sale Register did. The mill books almost no yarn contracts, so
 * contract-based reports came out empty (owner 2026-10-22).
 */

export type RegisterFilters = {
  from: string;
  to: string;
  party: string;
  count: string;
  brand: string;
  rate: number | null;
  type: "" | "PUR" | "SAL";
};

export type RegisterLine = {
  type: "PUR" | "SAL";
  vNo: string;
  vDate: string;
  party: string;
  countCode: string;
  countLabel: string;
  brand: string;
  doNo: string;
  bags: number;
  lbs: number;
  rate: number;
  amount: number;
};

export type Totals = { bags: number; lbs: number; amount: number; avgRate: number };

export function readFilters(p: Record<string, string | undefined>): RegisterFilters {
  const rateRaw = p.rate?.trim() ?? "";
  return {
    from: p.from?.trim() || monthsAgo(6),
    to: p.to?.trim() || todayFn(),
    party: p.party?.trim() ?? "",
    count: p.count?.trim() ?? "",
    brand: p.brand?.trim() ?? "",
    rate: rateRaw !== "" && !Number.isNaN(Number(rateRaw)) ? Number(rateRaw) : null,
    type: p.type === "PUR" || p.type === "SAL" ? p.type : "",
  };
}

export function totalsOf(lines: RegisterLine[]): Totals {
  const bags = lines.reduce((s, l) => s + l.bags, 0);
  const lbs = lines.reduce((s, l) => s + l.lbs, 0);
  const amount = lines.reduce((s, l) => s + l.amount, 0);
  return { bags, lbs, amount, avgRate: lbs > 0 ? amount / lbs : 0 };
}

export async function loadRegister(f: RegisterFilters) {
  const [accounts, counts] = await Promise.all([
    db.select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description }).from(schema.chartOfAccounts),
    db.select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type }).from(schema.yarnCounts),
  ]);
  const labels = countLabelMap(counts);

  // The filter form offers account codes (contracts) and voucher party names;
  // a voucher stores the name.
  const partyName = f.party ? accounts.find((a) => a.code === f.party)?.description ?? null : null;
  const partyLabel = partyName ?? f.party;
  const countLabel = f.count ? labels.get(f.count) || f.count : "";

  const conds = (v: typeof schema.extYarnPurVoucher | typeof schema.extYarnSalVoucher, l: typeof schema.extYarnPurVoucherLine | typeof schema.extYarnSalVoucherLine) => {
    const c: SQL[] = [gte(v.vDate, f.from), lte(v.vDate, f.to)];
    if (f.party) c.push(partyName ? eq(v.party, partyName) : sql`${v.party} LIKE ${`%${escLike(f.party)}%`} ESCAPE '\\'`);
    if (f.count) {
      c.push(
        labels.has(f.count)
          ? eq(l.count, f.count)
          : sql`${l.count} IN (SELECT count_code FROM yarn_counts WHERE description LIKE ${`%${escLike(f.count)}%`} ESCAPE '\\')`,
      );
    }
    if (f.brand) c.push(sql`${l.brand} LIKE ${`%${escLike(f.brand)}%`} ESCAPE '\\'`);
    if (f.rate !== null) c.push(sql`ABS(COALESCE(${l.rate}, 0) - ${f.rate}) < 0.0001`);
    return and(...c);
  };

  const P = schema.extYarnPurVoucher;
  const PL = schema.extYarnPurVoucherLine;
  const S = schema.extYarnSalVoucher;
  const SL = schema.extYarnSalVoucherLine;

  const [pur, sal] = await Promise.all([
    f.type === "SAL"
      ? []
      : db
          .select({ vNo: P.vNo, vDate: P.vDate, party: P.party, count: PL.count, brand: PL.brand, doNo: PL.doNo, qty: PL.qty, bag: PL.bag, lbs: PL.lbs, rate: PL.rate })
          .from(PL)
          .innerJoin(P, eq(P.id, PL.voucherId))
          .where(conds(P, PL)),
    f.type === "PUR"
      ? []
      : db
          .select({ vNo: S.vNo, vDate: S.vDate, party: S.party, count: SL.count, brand: SL.brand, doNo: SL.doNo, qty: SL.qty, bag: SL.bag, lbs: SL.lbs, rate: SL.rate, amt: SL.amt })
          .from(SL)
          .innerJoin(S, eq(S.id, SL.voucherId))
          .where(conds(S, SL)),
  ]);

  const line = (type: "PUR" | "SAL", r: { vNo: string; vDate: string; party: string | null; count: string | null; brand: string | null; doNo: string | null; qty: number | null; bag: number | null; lbs: number | null; rate: number | null }, amt: number | null): RegisterLine => {
    const lbs = r.lbs ?? 0;
    const rate = r.rate ?? 0;
    const countCode = (r.count ?? "").trim();
    return {
      type,
      vNo: r.vNo,
      vDate: r.vDate,
      party: r.party ?? "",
      countCode,
      countLabel: labels.get(countCode) || countCode || "—",
      brand: r.brand ?? "",
      doNo: r.doNo ?? "",
      // Bags are entered as Qty (lbs = qty × 100); the bag column is rarely filled.
      bags: r.bag || r.qty || 0,
      lbs,
      rate,
      amount: amt ?? Math.round(lbs * rate * 100) / 100,
    };
  };

  // Blank grid rows saved by a remark alone (browser autofill typed "admin") carry nothing.
  const lines = [...pur.map((r) => line("PUR", r, null)), ...sal.map((r) => line("SAL", r, r.amt))]
    .filter((l) => l.countCode || l.bags || l.lbs || l.amount)
    .sort(
    (a, b) => a.vDate.localeCompare(b.vDate) || a.vNo.localeCompare(b.vNo),
  );

  return { lines, partyLabel, countLabel };
}

export function filterText(f: RegisterFilters, partyLabel: string, countLabel: string): string {
  return [
    `Period: ${f.from} to ${f.to}`,
    f.type === "PUR" ? "Purchase only" : f.type === "SAL" ? "Sale only" : "Purchase & sale",
    partyLabel ? `Party: ${partyLabel}` : "",
    countLabel ? `Count: ${countLabel}` : "",
    f.brand ? `Brand: ${f.brand}` : "",
    f.rate !== null ? `Rate: ${f.rate}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
