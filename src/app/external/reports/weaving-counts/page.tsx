import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { sql, and, gte, lte, eq } from "drizzle-orm";
import { today as todayFn } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function monthsBackFrom(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

type View =
  | "CONV_NEW"
  | "CONV_SUM"
  | "CONV_SUM_NEW"
  | "SALE_NEW"
  | "SALE_SUM"
  | "SALE_SUM_NEW";

const VIEWS: readonly View[] = [
  "CONV_NEW",
  "CONV_SUM",
  "CONV_SUM_NEW",
  "SALE_NEW",
  "SALE_SUM",
  "SALE_SUM_NEW",
] as const;

const VIEW_LABELS: Record<View, string> = {
  CONV_NEW: "Conv - New (Detail)",
  CONV_SUM: "Conv - Sum by Party",
  CONV_SUM_NEW: "Conv - Sum by Party + Grey Code",
  SALE_NEW: "Sale - New (Detail)",
  SALE_SUM: "Sale - Sum by Party",
  SALE_SUM_NEW: "Sale - Sum by Party + Count Code",
};

const PARTY_STATUS: readonly string[] = ["R", "A", "C"] as const;

type RowOut = {
  contNo?: string | null;
  contDate?: string | null;
  party?: string | null;
  grayCode?: string | null;
  loomType?: string | null;
  countCode?: string | null;
  brand?: string | null;
  ratio?: string | null;
  qty?: number;
  rate?: number;
  cost?: number;
  amount?: number;
  status?: string | null;
  contracts?: number;
};

type ColSpec = { key: keyof RowOut; label: string; align?: "right" };

export default async function WeavingCountsReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    partyStatus?: string;
    shortTittle?: string;
    tittle?: string;
    code?: string;
    status?: string;
    yarnCount?: string;
    ratePerLbs?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const from = (params.from?.trim()) || monthsBackFrom(today, 6);
  const to = (params.to?.trim()) || today;

  const partyStatusRaw = (params.partyStatus?.trim().toUpperCase()) || "R";
  const partyStatus = PARTY_STATUS.includes(partyStatusRaw) ? partyStatusRaw : "R";

  const shortTittle = (params.shortTittle?.trim()) || "";
  const tittle = (params.tittle?.trim()) || "";
  const codeQ = (params.code?.trim()) || "";

  const statusRaw = (params.status?.trim().toUpperCase()) || "R";
  const status = PARTY_STATUS.includes(statusRaw) ? statusRaw : "R";

  const yarnCount = (params.yarnCount?.trim()) || "";

  const rateStr = (params.ratePerLbs?.trim()) || "";
  const rateParsed = parseFloat(rateStr);
  const rate = rateStr !== "" && Number.isFinite(rateParsed) ? rateParsed : null;

  const viewRaw = (params.view?.trim().toUpperCase()) || "CONV_NEW";
  const view: View = (VIEWS as readonly string[]).includes(viewRaw) ? (viewRaw as View) : "CONV_NEW";

  const partyConditions = [eq(schema.chartOfAccounts.status, partyStatus)];
  if (shortTittle) {
    const p = `%${escLike(shortTittle)}%`;
    partyConditions.push(sql`${schema.chartOfAccounts.descShort} LIKE ${p} ESCAPE '\\'`);
  }
  if (tittle) {
    const p = `%${escLike(tittle)}%`;
    partyConditions.push(sql`${schema.chartOfAccounts.description} LIKE ${p} ESCAPE '\\'`);
  }
  if (codeQ) {
    const p = `%${escLike(codeQ)}%`;
    partyConditions.push(sql`${schema.chartOfAccounts.code} LIKE ${p} ESCAPE '\\'`);
  }

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
    })
    .from(schema.chartOfAccounts)
    .where(and(...partyConditions));

  const partyCodeToDesc = new Map(parties.map((p) => [p.code, p.description]));
  const partyDescToCode = new Map(parties.map((p) => [p.description, p.code]));
  const partyDescSet = new Set(parties.map((p) => p.description));
  const partyCodeSet = new Set(parties.map((p) => p.code));

  const greyRows = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction);
  const greyDescByCode = new Map(greyRows.map((r) => [r.code, r.description]));

  const countRows = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts);
  const countDescByCode = new Map(countRows.map((r) => [r.countCode, r.description]));

  const isConv = view.startsWith("CONV");

  let rows: RowOut[] = [];
  let headers: ColSpec[] = [];

  if (isConv) {
    const conds = [
      gte(schema.extGreyConvContract.contDate, from),
      lte(schema.extGreyConvContract.contDate, to),
      eq(schema.extGreyConvContract.status, status),
    ];
    if (yarnCount) {
      const p = `%${escLike(yarnCount)}%`;
      conds.push(sql`${schema.extGreyConvContract.grayCode} LIKE ${p} ESCAPE '\\'`);
    }
    if (rate !== null) {
      conds.push(eq(schema.extGreyConvContract.rateMtr, rate));
    }

    const convRows = await db
      .select()
      .from(schema.extGreyConvContract)
      .where(and(...conds))
      .orderBy(schema.extGreyConvContract.contDate);

    const filtered = convRows.filter((r) => r.party && partyDescSet.has(r.party));

    if (view === "CONV_NEW") {
      headers = [
        { key: "contNo", label: "Cont No" },
        { key: "contDate", label: "Cont Date" },
        { key: "party", label: "Party" },
        { key: "grayCode", label: "Gray Code" },
        { key: "loomType", label: "Loom Type" },
        { key: "qty", label: "Qty Mtr", align: "right" },
        { key: "rate", label: "Rate/Mtr", align: "right" },
        { key: "cost", label: "Cost/Mtr", align: "right" },
        { key: "status", label: "Status" },
      ];
      rows = filtered.map((r) => ({
        contNo: r.contNo,
        contDate: r.contDate,
        party: r.party ?? "",
        grayCode: r.grayCode ?? "",
        loomType: r.loomType ?? "",
        qty: r.qtyMtr ?? 0,
        rate: r.rateMtr ?? 0,
        cost: r.costPerMtr ?? 0,
        amount: (r.qtyMtr ?? 0) * (r.rateMtr ?? 0),
        status: r.status,
      }));
    } else if (view === "CONV_SUM") {
      const map = new Map<
        string,
        { party: string; contracts: number; qty: number; amount: number }
      >();
      for (const r of filtered) {
        const key = r.party ?? "";
        if (!map.has(key)) map.set(key, { party: key, contracts: 0, qty: 0, amount: 0 });
        const g = map.get(key)!;
        g.contracts += 1;
        g.qty += r.qtyMtr ?? 0;
        g.amount += (r.qtyMtr ?? 0) * (r.rateMtr ?? 0);
      }
      const arr = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
      headers = [
        { key: "party", label: "Party" },
        { key: "contracts", label: "Total Contracts", align: "right" },
        { key: "qty", label: "Total Qty Mtr", align: "right" },
        { key: "amount", label: "Total Amount", align: "right" },
        { key: "rate", label: "Avg Rate", align: "right" },
      ];
      rows = arr.map((g) => ({
        party: g.party,
        contracts: g.contracts,
        qty: g.qty,
        amount: g.amount,
        rate: g.qty > 0 ? g.amount / g.qty : 0,
      }));
    } else {
      const map = new Map<
        string,
        { party: string; grayCode: string; contracts: number; qty: number; amount: number }
      >();
      for (const r of filtered) {
        const p = r.party ?? "";
        const g = r.grayCode ?? "";
        const key = `${p}|||${g}`;
        if (!map.has(key))
          map.set(key, { party: p, grayCode: g, contracts: 0, qty: 0, amount: 0 });
        const ent = map.get(key)!;
        ent.contracts += 1;
        ent.qty += r.qtyMtr ?? 0;
        ent.amount += (r.qtyMtr ?? 0) * (r.rateMtr ?? 0);
      }
      const arr = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
      headers = [
        { key: "party", label: "Party" },
        { key: "grayCode", label: "Grey Code" },
        { key: "contracts", label: "Total Contracts", align: "right" },
        { key: "qty", label: "Total Qty Mtr", align: "right" },
        { key: "amount", label: "Total Amount", align: "right" },
      ];
      rows = arr.map((g) => ({
        party: g.party,
        grayCode: g.grayCode,
        contracts: g.contracts,
        qty: g.qty,
        amount: g.amount,
      }));
    }
  } else {
    const conds = [
      gte(schema.extYarnSalContract.contDate, from),
      lte(schema.extYarnSalContract.contDate, to),
      eq(schema.extYarnSalContract.status, status),
    ];
    if (yarnCount) {
      const p = `%${escLike(yarnCount)}%`;
      conds.push(sql`${schema.extYarnSalContract.countCode} LIKE ${p} ESCAPE '\\'`);
    }
    if (rate !== null) {
      conds.push(eq(schema.extYarnSalContract.ratePerLbs, rate));
    }

    const saleRows = await db
      .select()
      .from(schema.extYarnSalContract)
      .where(and(...conds))
      .orderBy(schema.extYarnSalContract.contDate);

    const filtered = saleRows.filter((r) => r.partyCode && partyCodeSet.has(r.partyCode));

    if (view === "SALE_NEW") {
      headers = [
        { key: "contNo", label: "Cont No" },
        { key: "contDate", label: "Cont Date" },
        { key: "party", label: "Party" },
        { key: "countCode", label: "Count Code" },
        { key: "brand", label: "Brand" },
        { key: "ratio", label: "Ratio" },
        { key: "qty", label: "Qty Bags", align: "right" },
        { key: "rate", label: "Rate/Lbs", align: "right" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "status", label: "Status" },
      ];
      rows = filtered.map((r) => ({
        contNo: r.contNo,
        contDate: r.contDate,
        party: partyCodeToDesc.get(r.partyCode ?? "") ?? r.partyCode ?? "",
        countCode: r.countCode ?? "",
        brand: r.brand ?? "",
        ratio: r.ratio ?? "",
        qty: r.qtyBags ?? 0,
        rate: r.ratePerLbs ?? 0,
        amount: r.amount ?? 0,
        status: r.status,
      }));
    } else if (view === "SALE_SUM") {
      const map = new Map<
        string,
        { party: string; contracts: number; qty: number; amount: number }
      >();
      for (const r of filtered) {
        const key = r.partyCode ?? "";
        if (!map.has(key)) {
          map.set(key, {
            party: partyCodeToDesc.get(key) ?? key,
            contracts: 0,
            qty: 0,
            amount: 0,
          });
        }
        const g = map.get(key)!;
        g.contracts += 1;
        g.qty += r.qtyBags ?? 0;
        g.amount += r.amount ?? 0;
      }
      const arr = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
      headers = [
        { key: "party", label: "Party" },
        { key: "contracts", label: "Total Contracts", align: "right" },
        { key: "qty", label: "Total Bags", align: "right" },
        { key: "amount", label: "Total Amount", align: "right" },
        { key: "rate", label: "Avg Rate", align: "right" },
      ];
      rows = arr.map((g) => ({
        party: g.party,
        contracts: g.contracts,
        qty: g.qty,
        amount: g.amount,
        rate: g.qty > 0 ? g.amount / g.qty : 0,
      }));
    } else {
      const map = new Map<
        string,
        { party: string; countCode: string; contracts: number; qty: number; amount: number }
      >();
      for (const r of filtered) {
        const p = r.partyCode ?? "";
        const c = r.countCode ?? "";
        const key = `${p}|||${c}`;
        if (!map.has(key))
          map.set(key, {
            party: partyCodeToDesc.get(p) ?? p,
            countCode: c,
            contracts: 0,
            qty: 0,
            amount: 0,
          });
        const ent = map.get(key)!;
        ent.contracts += 1;
        ent.qty += r.qtyBags ?? 0;
        ent.amount += r.amount ?? 0;
      }
      const arr = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
      headers = [
        { key: "party", label: "Party" },
        { key: "countCode", label: "Count Code" },
        { key: "contracts", label: "Total Contracts", align: "right" },
        { key: "qty", label: "Total Bags", align: "right" },
        { key: "amount", label: "Total Amount", align: "right" },
      ];
      rows = arr.map((g) => ({
        party: g.party,
        countCode: g.countCode,
        contracts: g.contracts,
        qty: g.qty,
        amount: g.amount,
      }));
    }
  }

  const totalRecords = rows.length;
  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalQty = rows.reduce((s, r) => s + (r.qty ?? 0), 0);
  const totalParties = new Set(rows.map((r) => r.party ?? "").filter((x) => x !== "")).size;

  const qtyUnit = isConv ? "mtr" : "bags";

  const excelRows: Record<string, unknown>[] = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const h of headers) {
      const v = r[h.key];
      out[h.key as string] =
        typeof v === "number" ? Math.round(v) : v ?? "";
    }
    return out;
  });

  return (
    <Shell active="ext-r-weaving">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Weaving Counts Accounts Report</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {totalRecords} rows &middot; {from} to {to} &middot; View: {VIEW_LABELS[view]}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={headers.map((h) => ({ key: h.key as string, label: h.label }))}
              filename="weaving-counts-accounts"
              sheetName="WeavingCounts"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Weaving Counts Accounts Report</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to} &middot; View: {VIEW_LABELS[view]} &middot; Party Status:{" "}
            {partyStatus} &middot; Status: {status}
            {codeQ ? ` · Code: ${codeQ}` : ""}
            {shortTittle ? ` · Short Tittle: ${shortTittle}` : ""}
            {tittle ? ` · Tittle: ${tittle}` : ""}
            {yarnCount ? ` · Yarn Count: ${yarnCount}` : ""}
            {rate !== null ? ` · Rate/Lbs: ${rate}` : ""}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Date From</label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">Party Status</label>
            <select name="partyStatus" defaultValue={partyStatus} className="input-box mono">
              <option value="R">R - Running</option>
              <option value="A">A - Active</option>
              <option value="C">C - Closed</option>
            </select>
          </div>
          <div>
            <label className="label block mb-1">Short Tittle</label>
            <input
              type="text"
              name="shortTittle"
              defaultValue={shortTittle}
              className="input-box mono"
              placeholder="Short name/code"
            />
          </div>
          <div>
            <label className="label block mb-1">Tittle</label>
            <input
              type="text"
              name="tittle"
              defaultValue={tittle}
              className="input-box mono"
              placeholder="Party name"
            />
          </div>
          <div>
            <label className="label block mb-1">Code</label>
            <input
              type="text"
              name="code"
              defaultValue={codeQ}
              className="input-box mono"
              placeholder="COA code"
            />
          </div>
          <div>
            <label className="label block mb-1">Status</label>
            <select name="status" defaultValue={status} className="input-box mono">
              <option value="R">R - Running</option>
              <option value="A">A - Active</option>
              <option value="C">C - Closed</option>
            </select>
          </div>
          <div>
            <label className="label block mb-1">Yarn Count</label>
            <input
              type="text"
              name="yarnCount"
              defaultValue={yarnCount}
              className="input-box mono"
              placeholder="Count code"
            />
          </div>
          <div>
            <label className="label block mb-1">Rate/Lbs</label>
            <input
              type="number"
              step="any"
              name="ratePerLbs"
              defaultValue={rate ?? ""}
              className="input-box mono text-right"
            />
          </div>
          <div>
            <label className="label block mb-1">View</label>
            <select name="view" defaultValue={view} className="input-box mono">
              {VIEWS.map((v) => (
                <option key={v} value={v}>
                  {VIEW_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2 lg:col-span-5">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/external/reports/weaving-counts" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalRecords)}</div>
            <div className="stat-label">Total Records</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalAmount)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt(totalQty)}{" "}
              <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider ml-1">
                {qtyUnit}
              </span>
            </div>
            <div className="stat-label">Total Quantity</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalParties)}</div>
            <div className="stat-label">Total Parties</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h.key as string} className={h.align === "right" ? "text-right" : ""}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length} className="text-center text-[var(--muted)] py-8">
                    No records found
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    {headers.map((h) => {
                      const v = r[h.key];
                      const isNumber = typeof v === "number";
                      const cls = h.align === "right" ? "mono text-right" : "text-[13px]";
                      let display: string;
                      if (isNumber) {
                        display = fmt(v as number);
                      } else if (v == null || v === "") {
                        display = "-";
                      } else {
                        const s = String(v);
                        if (h.key === "party") {
                          const code = partyDescToCode.get(s);
                          display = code ? `${s} (${code})` : s;
                        } else if (h.key === "grayCode") {
                          const desc = greyDescByCode.get(s);
                          display = desc ? `${s} — ${desc}` : s;
                        } else if (h.key === "countCode") {
                          const desc = countDescByCode.get(s);
                          display = desc ? `${s} — ${desc}` : s;
                        } else {
                          display = s;
                        }
                      }
                      return (
                        <td key={h.key as string} className={cls}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td className="text-[13px]">GRAND TOTAL</td>
                  {headers.slice(1).map((h) => {
                    if (h.key === "qty")
                      return (
                        <td key={h.key as string} className="mono text-right">
                          {fmt(totalQty)}
                        </td>
                      );
                    if (h.key === "amount")
                      return (
                        <td key={h.key as string} className="mono text-right">
                          {fmt(totalAmount)}
                        </td>
                      );
                    if (h.key === "contracts")
                      return (
                        <td key={h.key as string} className="mono text-right">
                          {fmt(rows.reduce((s, r) => s + (r.contracts ?? 0), 0))}
                        </td>
                      );
                    return <td key={h.key as string}></td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
