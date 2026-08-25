import { db, schema } from "@/db";
import { today, monthsAgo } from "@/lib/time";

export const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-PK").format(Math.round(n));

export const fmt2 = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-PK", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

export function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

export function sixMonthsAgo(): string {
  return monthsAgo(6);
}

export function todayIso(): string {
  return today();
}

export async function partyOptions() {
  const rows = await db.select().from(schema.chartOfAccounts);
  return rows
    .filter((a) => (a.level ?? 0) >= 4)
    .map((a) => ({
      value: a.code,
      label: `${a.code} — ${a.description}`,
      desc: a.description,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export async function partyByNameOptions() {
  const rows = await db.select().from(schema.chartOfAccounts);
  return rows
    .filter((a) => (a.level ?? 0) >= 4)
    .map((a) => ({
      value: a.description,
      label: a.description,
      desc: a.code,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export async function greyQualityOptions() {
  const rows = await db.select().from(schema.greyConstruction);
  return rows.map((g) => ({
    value: g.code,
    label: `${g.code} — ${g.description}`,
    desc: g.description,
  }));
}

export async function yarnCountOptions() {
  const rows = await db.select().from(schema.yarnCounts);
  return rows.map((y) => ({
    value: y.countCode,
    label: `${y.countCode} — ${y.description}`,
    desc: y.description,
  }));
}
