import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "R", label: "R - Running" },
  { value: "C", label: "C - Completed" },
  { value: "F", label: "F - Finished" },
  { value: "X", label: "X - Cancelled" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "PUR", label: "PUR - Purchase" },
  { value: "SAL", label: "SAL - Sale" },
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
    shortTittle?: string;
    tittle?: string;
    code?: string;
    type?: string;
    status?: string;
    brand?: string;
    reg2_code?: string;
    reg2_desc?: string;
    reg2_brand?: string;
    pur_rate?: string;
  }>;
}) {
  const params = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const shortTittle = params.shortTittle?.trim() ?? "";
  const tittle = params.tittle?.trim() ?? "";
  const code = params.code?.trim() ?? "";
  const type = params.type?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const brand = params.brand?.trim() ?? "";
  const reg2Code = params.reg2_code?.trim() ?? "";
  const reg2Desc = params.reg2_desc?.trim() ?? "";
  const reg2Brand = params.reg2_brand?.trim() ?? "";
  const purRateRaw = params.pur_rate?.trim() ?? "";
  const purRate = purRateRaw !== "" && !Number.isNaN(Number(purRateRaw)) ? Number(purRateRaw) : null;

  const purConditions = [
    gte(schema.extYarnPurContract.contDate, from),
    lte(schema.extYarnPurContract.contDate, to),
  ];
  const salConditions = [
    gte(schema.extYarnSalContract.contDate, from),
    lte(schema.extYarnSalContract.contDate, to),
  ];

  if (shortTittle) {
    const pat = `%${escLike(shortTittle)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.countCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.countCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (tittle) {
    const pat = `%${escLike(tittle)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.partyCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.partyCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (code) {
    const pat = `%${escLike(code)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.contNo} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.contNo} LIKE ${pat} ESCAPE '\\'`);
  }
  if (status) {
    purConditions.push(eq(schema.extYarnPurContract.status, status));
    salConditions.push(eq(schema.extYarnSalContract.status, status));
  }
  if (brand) {
    const pat = `%${escLike(brand)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.brand} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.brand} LIKE ${pat} ESCAPE '\\'`);
  }

  if (reg2Code) {
    const pat = `%${escLike(reg2Code)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.countCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.countCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (reg2Desc) {
    const pat = `%${escLike(reg2Desc)}%`;
    purConditions.push(sql`(
      ${schema.extYarnPurContract.partyCode} IN (SELECT code FROM chart_of_accounts WHERE description LIKE ${pat} ESCAPE '\\')
      OR ${schema.extYarnPurContract.countCode} IN (SELECT count_code FROM yarn_counts WHERE description LIKE ${pat} ESCAPE '\\')
      OR ${schema.extYarnPurContract.partyCode} LIKE ${pat} ESCAPE '\\'
    )`);
    salConditions.push(sql`(
      ${schema.extYarnSalContract.partyCode} IN (SELECT code FROM chart_of_accounts WHERE description LIKE ${pat} ESCAPE '\\')
      OR ${schema.extYarnSalContract.countCode} IN (SELECT count_code FROM yarn_counts WHERE description LIKE ${pat} ESCAPE '\\')
      OR ${schema.extYarnSalContract.partyCode} LIKE ${pat} ESCAPE '\\'
    )`);
  }
  if (reg2Brand) {
    const pat = `%${escLike(reg2Brand)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.brand} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.brand} LIKE ${pat} ESCAPE '\\'`);
  }
  if (purRate !== null) {
    purConditions.push(sql`ABS(COALESCE(${schema.extYarnPurContract.ratePerLbs}, 0) - ${purRate}) < 0.0001`);
    salConditions.push(sql`ABS(COALESCE(${schema.extYarnSalContract.ratePerLbs}, 0) - ${purRate}) < 0.0001`);
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
    party: r.party ?? "",
    countCode: r.countCode ?? "",
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

  const filterParams: Record<string, string> = {};
  if (from) filterParams.from = from;
  if (to) filterParams.to = to;
  if (shortTittle) filterParams.shortTittle = shortTittle;
  if (tittle) filterParams.tittle = tittle;
  if (code) filterParams.code = code;
  if (type) filterParams.type = type;
  if (status) filterParams.status = status;
  if (brand) filterParams.brand = brand;
  if (reg2Code) filterParams.code = reg2Code;
  if (reg2Desc) filterParams.desc = reg2Desc;
  if (reg2Brand) filterParams.brand = reg2Brand;
  if (purRateRaw) filterParams.purRate = purRateRaw;

  const buildHref = (base: string, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (reg2Code || shortTittle) qs.set("code", reg2Code || shortTittle);
    if (reg2Brand || brand) qs.set("brand", reg2Brand || brand);
    if (tittle) qs.set("party", tittle);
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
              {combined.length} contracts &middot; {from} to {to}
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
                { key: "countCode", label: "Count Code" },
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
            Period: {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black mb-6 no-print"
        >
          <div className="p-4 border-b border-black">
            <div className="label mb-3">Section 1 &mdash; Date Range</div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="label block mb-1">Date From</label>
                <input type="date" name="from" defaultValue={from} className="input-box mono" />
              </div>
              <div>
                <label className="label block mb-1">Date To</label>
                <input type="date" name="to" defaultValue={to} className="input-box mono" />
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-black">
            <div className="label mb-3">Section 2 &mdash; Title Filters</div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="label block mb-1">Short Tittle</label>
                <input type="text" name="shortTittle" defaultValue={shortTittle} className="input-box mono" placeholder="Count Code" />
              </div>
              <div>
                <label className="label block mb-1">Tittle</label>
                <input type="text" name="tittle" defaultValue={tittle} className="input-box" placeholder="Party" />
              </div>
              <div>
                <label className="label block mb-1">Code</label>
                <input type="text" name="code" defaultValue={code} className="input-box mono" placeholder="Contract No" />
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="label mb-3">Section 3 &mdash; Advanced Filters</div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="label block mb-1">Code</label>
                <input type="text" name="reg2_code" defaultValue={reg2Code} className="input-box mono" placeholder="Count Code" />
              </div>
              <div>
                <label className="label block mb-1">Description</label>
                <input type="text" name="reg2_desc" defaultValue={reg2Desc} className="input-box" placeholder="Party / Count Desc" />
              </div>
              <div>
                <label className="label block mb-1">Brand</label>
                <input type="text" name="reg2_brand" defaultValue={reg2Brand} className="input-box" />
              </div>
              <div>
                <label className="label block mb-1">Pur Rate</label>
                <input type="number" step="0.01" name="pur_rate" defaultValue={purRateRaw} className="input-box mono" placeholder="Rate/Lbs" />
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
              <div>
                <label className="label block mb-1">Brand (Sec 2)</label>
                <input type="text" name="brand" defaultValue={brand} className="input-box" />
              </div>
              <div className="flex items-end gap-2">
                <button type="submit" className="btn btn-sm">Apply</button>
                <a href="/external/reports/yarn-register" className="btn btn-outline btn-sm">Clear</a>
              </div>
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
              <a href="/" className="btn btn-sm text-center">Exit</a>
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
                <th>Count Code</th>
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
                  <td colSpan={12} className="text-center text-[var(--muted)] py-8">
                    No records found
                  </td>
                </tr>
              ) : (
                combined.map((r) => (
                  <tr key={`${r.type}-${r.id}`}>
                    <td className="mono text-[12px] font-bold">{r.type}</td>
                    <td className="mono text-[13px] font-bold">{r.contNo}</td>
                    <td className="mono text-[13px]">{r.contDate}</td>
                    <td className="text-[13px]">{r.party ?? "-"}</td>
                    <td className="mono text-[13px]">{r.countCode ?? "-"}</td>
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
