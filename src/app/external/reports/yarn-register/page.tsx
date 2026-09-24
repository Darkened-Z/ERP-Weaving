import Link from "next/link";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, eq, sql } from "drizzle-orm";
import { today as todayFn, monthsAgo } from "@/lib/time";
import { DateBox } from "@/components/date-box";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function sixMonthsAgo(): string {
  return monthsAgo(6);
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "R", label: "R - Running" },
  { value: "C", label: "C - Completed" },
  { value: "F", label: "F - Finished" },
  { value: "X", label: "X - Cancelled" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All - Purchase & Sale" },
  { value: "PUR", label: "PUR - Purchase only" },
  { value: "SAL", label: "SAL - Sale only" },
];

type Row = {
  type: "PUR" | "SAL";
  id: number;
  contNo: string;
  contDate: string;
  party: string | null;
  countCode: string | null;
  brand: string | null;
  ratio: string | null;
  qtyBags: number | null;
  ratePerLbs: number | null;
  amount: number | null;
  days: number | null;
  status: string;
};

export default async function YarnRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    party?: string;
    count?: string;
    brand?: string;
    type?: string;
    status?: string;
    rate?: string;
  }>;
}) {
  await requireSession();
  const params = await searchParams;

  const today = todayFn();
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const party = params.party?.trim() ?? "";
  const count = params.count?.trim() ?? "";
  const brand = params.brand?.trim() ?? "";
  const type = params.type?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const rateRaw = params.rate?.trim() ?? "";
  const rate = rateRaw !== "" && !Number.isNaN(Number(rateRaw)) ? Number(rateRaw) : null;

  const accountRows = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const partyDescByCode = new Map(accountRows.map((r) => [r.code, r.description]));
  const countLookup = await db
    .select({
      countCode: schema.yarnCounts.countCode,
      description: schema.yarnCounts.description,
      type: schema.yarnCounts.type,
    })
    .from(schema.yarnCounts);
  const countDescByCode = new Map(countLookup.map((r) => [r.countCode, r.description]));
  const countBlendByCode = new Map(countLookup.map((r) => [r.countCode, r.type]));

  const [purAll, salAll] = await Promise.all([
    db
      .select({
        partyCode: schema.extYarnPurContract.partyCode,
        countCode: schema.extYarnPurContract.countCode,
        brand: schema.extYarnPurContract.brand,
      })
      .from(schema.extYarnPurContract)
      .where(and(gte(schema.extYarnPurContract.contDate, from), lte(schema.extYarnPurContract.contDate, to))),
    db
      .select({
        partyCode: schema.extYarnSalContract.partyCode,
        countCode: schema.extYarnSalContract.countCode,
        brand: schema.extYarnSalContract.brand,
      })
      .from(schema.extYarnSalContract)
      .where(and(gte(schema.extYarnSalContract.contDate, from), lte(schema.extYarnSalContract.contDate, to))),
  ]);
  const optionRows = [...purAll, ...salAll];
  const uniq = (xs: Array<string | null>) =>
    Array.from(new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );

  const partyOptions = uniq(optionRows.map((r) => r.partyCode)).map((c) => ({
    value: c,
    label: partyDescByCode.get(c) ?? c,
    desc: c,
  }));
  const scoped = party ? optionRows.filter((r) => (r.partyCode ?? "") === party) : optionRows;
  const countOptions = uniq(scoped.map((r) => r.countCode)).map((c) => ({
    value: c,
    label: countDescByCode.get(c) ? `${c} — ${countDescByCode.get(c)}` : c,
    desc: countBlendByCode.get(c) ?? "",
  }));
  const brandOptions = uniq(scoped.map((r) => r.brand)).map((b) => ({ value: b, label: b }));

  const purConditions = [
    gte(schema.extYarnPurContract.contDate, from),
    lte(schema.extYarnPurContract.contDate, to),
  ];
  const salConditions = [
    gte(schema.extYarnSalContract.contDate, from),
    lte(schema.extYarnSalContract.contDate, to),
  ];

  if (party) {
    const pat = `%${escLike(party)}%`;
    purConditions.push(sql`(
      ${schema.extYarnPurContract.partyCode} = ${party}
      OR ${schema.extYarnPurContract.partyCode} IN (
        SELECT code FROM chart_of_accounts WHERE description LIKE ${pat} ESCAPE '\\'
      )
    )`);
    salConditions.push(sql`(
      ${schema.extYarnSalContract.partyCode} = ${party}
      OR ${schema.extYarnSalContract.partyCode} IN (
        SELECT code FROM chart_of_accounts WHERE description LIKE ${pat} ESCAPE '\\'
      )
    )`);
  }
  if (count) {
    const pat = `%${escLike(count)}%`;
    purConditions.push(sql`(
      ${schema.extYarnPurContract.countCode} = ${count}
      OR ${schema.extYarnPurContract.countCode} IN (
        SELECT count_code FROM yarn_counts WHERE description LIKE ${pat} ESCAPE '\\'
      )
    )`);
    salConditions.push(sql`(
      ${schema.extYarnSalContract.countCode} = ${count}
      OR ${schema.extYarnSalContract.countCode} IN (
        SELECT count_code FROM yarn_counts WHERE description LIKE ${pat} ESCAPE '\\'
      )
    )`);
  }
  if (brand) {
    const pat = `%${escLike(brand)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.brand} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.brand} LIKE ${pat} ESCAPE '\\'`);
  }
  if (status) {
    purConditions.push(eq(schema.extYarnPurContract.status, status));
    salConditions.push(eq(schema.extYarnSalContract.status, status));
  }
  if (rate !== null) {
    purConditions.push(sql`ABS(COALESCE(${schema.extYarnPurContract.ratePerLbs}, 0) - ${rate}) < 0.0001`);
    salConditions.push(sql`ABS(COALESCE(${schema.extYarnSalContract.ratePerLbs}, 0) - ${rate}) < 0.0001`);
  }

  const purRows = type === "SAL" ? [] : await db.select().from(schema.extYarnPurContract).where(and(...purConditions));
  const salRows = type === "PUR" ? [] : await db.select().from(schema.extYarnSalContract).where(and(...salConditions));

  const combined: Row[] = [
    ...purRows.map((r) => ({
      type: "PUR" as const,
      id: r.id,
      contNo: r.contNo,
      contDate: r.contDate,
      party: r.partyCode,
      countCode: r.countCode,
      brand: r.brand,
      ratio: r.ratio,
      qtyBags: r.qtyBags,
      ratePerLbs: r.ratePerLbs,
      amount: r.amount,
      days: r.days,
      status: r.status,
    })),
    ...salRows.map((r) => ({
      type: "SAL" as const,
      id: r.id,
      contNo: r.contNo,
      contDate: r.contDate,
      party: r.partyCode,
      countCode: r.countCode,
      brand: r.brand,
      ratio: r.ratio,
      qtyBags: r.qtyBags,
      ratePerLbs: r.ratePerLbs,
      amount: r.amount,
      days: r.days,
      status: r.status,
    })),
  ].sort((a, b) => (b.contDate ?? "").localeCompare(a.contDate ?? ""));

  const totalPur = purRows.length;
  const totalSal = salRows.length;
  const totalBags = combined.reduce((s, r) => s + (r.qtyBags ?? 0), 0);
  const totalAmount = combined.reduce((s, r) => s + (r.amount ?? 0), 0);

  const excelRows = combined.map((r) => ({
    ...r,
    party: r.party ? (partyDescByCode.get(r.party) ?? r.party) : "",
    countCode: r.countCode ?? "",
    blend: r.countCode ? (countBlendByCode.get(r.countCode) ?? "") : "",
    brand: r.brand ?? "",
    ratio: r.ratio ?? "",
  }));

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; fg: string }> = {
      R: { bg: "black", fg: "white" },
      C: { bg: "transparent", fg: "black" },
      F: { bg: "transparent", fg: "black" },
      X: { bg: "transparent", fg: "var(--muted)" },
    };
    const v = map[s] ?? { bg: "transparent", fg: "black" };
    return (
      <span
        className="inline-block text-[11px] px-2 py-0.5 uppercase mono"
        style={{ letterSpacing: "0.05em", background: v.bg, color: v.fg, border: "1px solid black" }}
      >
        {s || "-"}
      </span>
    );
  };

  const activeBits = [
    party ? `Party: ${partyDescByCode.get(party) ?? party}` : "All parties",
    count ? `Count: ${countDescByCode.get(count) ? `${count} — ${countDescByCode.get(count)}` : count}` : "All counts",
    brand ? `Brand: ${brand}` : null,
    type === "PUR" ? "Purchase only" : type === "SAL" ? "Sale only" : "Purchase & sale",
    status ? `Status ${status}` : null,
  ].filter(Boolean);

  const buildHref = (base: string, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (count) qs.set("code", count);
    if (brand) qs.set("brand", brand);
    if (party) qs.set("party", party);
    for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
    const q = qs.toString();
    return q ? `${base}?${q}` : base;
  };

  return (
    <Shell active="ext-r-yarnreg">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Register</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {combined.length} contracts &middot; {from} to {to} &middot; {activeBits.join(" · ")}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "type", label: "Type" },
                { key: "contNo", label: "Cont No" },
                { key: "contDate", label: "Cont Date" },
                { key: "party", label: "Party" },
                { key: "countCode", label: "Count" },
                { key: "blend", label: "Blend" },
                { key: "brand", label: "Brand" },
                { key: "ratio", label: "Ratio" },
                { key: "qtyBags", label: "Qty Bags" },
                { key: "ratePerLbs", label: "Rate/Lbs" },
                { key: "amount", label: "Amount" },
                { key: "days", label: "Days" },
                { key: "status", label: "Status" },
              ]}
              filename="yarn-register"
              sheetName="YarnRegister"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Yarn Register</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to} &middot; {activeBits.join(" · ")}
          </div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-6 no-print">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="label block mb-1">Date From</label>
              <DateBox name="from" defaultValue={from} className="input-box mono" />
            </div>
            <div>
              <label className="label block mb-1">Date To</label>
              <DateBox name="to" defaultValue={to} className="input-box mono" />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Party</label>
              <Combobox name="party" options={partyOptions} defaultValue={party} placeholder="All parties" />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Count</label>
              <Combobox name="count" options={countOptions} defaultValue={count} placeholder="All counts" />
            </div>
            <div>
              <label className="label block mb-1">Brand</label>
              <Combobox name="brand" options={brandOptions} defaultValue={brand} placeholder="All brands" />
            </div>
            <div>
              <label className="label block mb-1">Rate/Lbs</label>
              <input type="number" step="0.01" name="rate" defaultValue={rateRaw} className="input-box mono" placeholder="Any rate" />
            </div>
            <div>
              <label className="label block mb-1">Type</label>
              <select name="type" defaultValue={type} className="input-box">
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Status</label>
              <select name="status" defaultValue={status} className="input-box">
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <button type="submit" className="btn btn-sm">Apply</button>
              <a href="/external/reports/yarn-register" className="btn btn-outline btn-sm">Clear</a>
            </div>
          </div>
        </form>

        <div className="border border-black p-4 mb-6 no-print">
          <div className="label mb-3">Actions</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <form method="GET" action="/external/reports/yarn-register/pur-cont-history" target="_blank" className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="label block mb-1">Pur Cont #</label>
                  <input type="text" name="contNo" className="input-box mono" placeholder="e.g. YPC-001" />
                </div>
                <button type="submit" className="btn btn-outline btn-sm">Pur Cont. History</button>
              </form>
              <form method="GET" action="/external/reports/yarn-register/sal-cont-history" target="_blank" className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="label block mb-1">Sal Cont #</label>
                  <input type="text" name="contNo" className="input-box mono" placeholder="e.g. YSC-001" />
                </div>
                <button type="submit" className="btn btn-outline btn-sm">Sal Cont. History</button>
              </form>
            </div>

            <div className="flex flex-col gap-3">
              <div className="label">Reports (current filters)</div>
              <div className="grid grid-cols-2 gap-2">
                <a href={buildHref("/external/reports/yarn-register/count-avg")} target="_blank" rel="noopener" className="btn btn-outline btn-sm text-center">Count Avg</a>
                <a href={buildHref("/external/reports/yarn-register/count-list")} target="_blank" rel="noopener" className="btn btn-outline btn-sm text-center">Count</a>
                <a href={buildHref("/external/reports/yarn-register/register-party")} target="_blank" rel="noopener" className="btn btn-outline btn-sm text-center">Register/Party</a>
                <a href={buildHref("/external/reports/yarn-register/do-no")} target="_blank" rel="noopener" className="btn btn-outline btn-sm text-center">DO No</a>
              </div>
              <Link href="/" className="btn btn-sm text-center">Exit</Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalPur)}</div>
            <div className="stat-label">Total Purchase</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalSal)}</div>
            <div className="stat-label">Total Sale</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalBags)}</div>
            <div className="stat-label">Total Bags</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalAmount)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Cont No</th>
                <th>Cont Date</th>
                <th>Party</th>
                <th>Count</th>
                <th>Blend</th>
                <th>Brand</th>
                <th>Ratio</th>
                <th className="text-right">Qty Bags</th>
                <th className="text-right">Rate/Lbs</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {combined.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center text-[var(--muted)] py-8">
                    No contracts match these filters
                  </td>
                </tr>
              ) : (
                combined.map((r) => (
                  <tr key={`${r.type}-${r.id}`}>
                    <td className="mono text-[12px] font-bold">{r.type}</td>
                    <td className="mono text-[13px] font-bold">{r.contNo}</td>
                    <td className="mono text-[13px]">{r.contDate}</td>
                    <td className="text-[13px]">
                      {r.party ? (partyDescByCode.get(r.party) ?? r.party) : "-"}
                      {r.party && partyDescByCode.get(r.party) ? (
                        <div className="text-[11px] text-[var(--muted)] mono">{r.party}</div>
                      ) : null}
                    </td>
                    <td className="mono text-[13px]">
                      {r.countCode ?? "-"}
                      {r.countCode && countDescByCode.get(r.countCode) ? (
                        <div className="text-[11px] text-[var(--muted)]">{countDescByCode.get(r.countCode)}</div>
                      ) : null}
                    </td>
                    <td className="mono text-[12px]">
                      {(r.countCode && countBlendByCode.get(r.countCode)) || "-"}
                    </td>
                    <td className="text-[13px]">{r.brand ?? "-"}</td>
                    <td className="mono text-[13px]">{r.ratio ?? "-"}</td>
                    <td className="mono text-right">{r.qtyBags != null ? fmt(r.qtyBags) : "-"}</td>
                    <td className="mono text-right">{r.ratePerLbs != null ? fmt(r.ratePerLbs) : "-"}</td>
                    <td className="mono text-right font-bold">{r.amount != null ? fmt(r.amount) : "-"}</td>
                    <td className="mono text-right">{r.days != null ? fmt(r.days) : "-"}</td>
                    <td>{statusBadge(r.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
