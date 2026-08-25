import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { today as todayFn, monthsAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : new Intl.NumberFormat("en-PK", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function sixMonthsAgo(): string {
  return monthsAgo(6);
}

export default async function CountAvgPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; code?: string; brand?: string }>;
}) {
  await requireSession();

  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const code = params.code?.trim() ?? "";
  const brand = params.brand?.trim() ?? "";

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const conditions = [
    gte(schema.extYarnPurContract.contDate, from),
    lte(schema.extYarnPurContract.contDate, to),
  ];
  if (code) {
    const pat = `%${escLike(code)}%`;
    conditions.push(sql`${schema.extYarnPurContract.countCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (brand) {
    const pat = `%${escLike(brand)}%`;
    conditions.push(sql`${schema.extYarnPurContract.brand} LIKE ${pat} ESCAPE '\\'`);
  }

  const rows = await db
    .select({
      countCode: schema.extYarnPurContract.countCode,
      contracts: sql<number>`COUNT(*)`,
      totalBags: sql<number>`COALESCE(SUM(${schema.extYarnPurContract.qtyBags}), 0)`,
      weightedRateNum: sql<number>`COALESCE(SUM(${schema.extYarnPurContract.qtyBags} * ${schema.extYarnPurContract.ratePerLbs}), 0)`,
      totalAmount: sql<number>`COALESCE(SUM(${schema.extYarnPurContract.amount}), 0)`,
    })
    .from(schema.extYarnPurContract)
    .where(and(...conditions))
    .groupBy(schema.extYarnPurContract.countCode);

  const countLookup = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts);
  const countDescByCode = new Map(countLookup.map((r) => [r.countCode, r.description]));

  const enriched = rows
    .map((r) => ({
      ...r,
      avgRate: r.totalBags > 0 ? r.weightedRateNum / r.totalBags : 0,
    }))
    .sort((a, b) => (a.countCode ?? "").localeCompare(b.countCode ?? ""));

  const grandContracts = enriched.reduce((s, r) => s + Number(r.contracts), 0);
  const grandBags = enriched.reduce((s, r) => s + Number(r.totalBags), 0);
  const grandAmount = enriched.reduce((s, r) => s + Number(r.totalAmount), 0);
  const grandWeightedNum = enriched.reduce((s, r) => s + Number(r.weightedRateNum), 0);
  const grandAvgRate = grandBags > 0 ? grandWeightedNum / grandBags : 0;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .rp-wrap { padding: 0 !important; background: #fff !important; }
          .rp-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
        }
        .rp-wrap { background: #f5f5f5; min-height: 100vh; padding: 24px 16px; }
        .rp-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: space-between; gap: 12px; }
        .rp-page {
          background: #fff; color: #000; max-width: 210mm; margin: 0 auto;
          padding: 20mm 18mm; border: 1px solid #000;
          font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; line-height: 1.45;
        }
        .rp-company { text-align: center; }
        .rp-company .name { font-size: 22pt; font-weight: 700; letter-spacing: 0.02em; }
        .rp-company .meta { font-size: 10pt; margin-top: 3px; }
        .rp-title {
          text-align: center; font-size: 16pt; font-weight: 700; letter-spacing: 0.24em;
          margin: 14px 0 12px; padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;
        }
        .rp-filter {
          font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; letter-spacing: 0.06em;
          text-transform: uppercase; text-align: center; margin-bottom: 14px; color: #333;
        }
        table.rp-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        table.rp-table th, table.rp-table td {
          border: 1px solid #000; padding: 6px 8px; font-size: 10.5pt;
          font-family: 'Georgia', 'Times New Roman', serif; text-align: left; vertical-align: top;
        }
        table.rp-table th {
          background: #fff; font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt;
          font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
        }
        table.rp-table td.num, table.rp-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
        table.rp-table tfoot td { font-weight: 700; background: #f0f0f0; }
        .rp-signatures { margin-top: 42px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
        .rp-sig { text-align: center; }
        .rp-sig-line { border-top: 1px solid #000; margin-bottom: 6px; height: 32px; }
        .rp-sig-label { font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
        .rp-footer { margin-top: 22px; font-size: 8.5pt; text-align: center; color: #333; letter-spacing: 0.05em; }
        .rp-empty { text-align: center; padding: 24px 0; font-style: italic; color: #555; }
      `}</style>

      <div className="rp-wrap">
        <div className="rp-toolbar no-print">
          <a href="/external/reports/yarn-register" className="btn btn-outline btn-sm">Back</a>
          <PrintButton label="Print" />
        </div>

        <div className="rp-page">
          <div className="rp-company">
            <div className="name">{company?.name ?? "Company Name"}</div>
            <div className="meta">
              {[company?.address, company?.city].filter(Boolean).join(", ") || "Address"}
              {company?.phone ? ` — Phone: ${company.phone}` : ""}
            </div>
          </div>

          <div className="rp-title">COUNT AVERAGED RATE REPORT</div>

          <div className="rp-filter">
            Period: {from} to {to}
            {code ? ` · Count: ${code}` : ""}
            {brand ? ` · Brand: ${brand}` : ""}
          </div>

          <table className="rp-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>#</th>
                <th>Count Code</th>
                <th className="num">Total Contracts</th>
                <th className="num">Total Bags</th>
                <th className="num">Weighted Avg Rate/Lbs</th>
                <th className="num">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={6} className="rp-empty">No purchase contracts found for the selected filters.</td>
                </tr>
              ) : (
                enriched.map((r, i) => (
                  <tr key={r.countCode ?? `row-${i}`}>
                    <td>{i + 1}</td>
                    <td>{r.countCode ? (countDescByCode.get(r.countCode) ? `${r.countCode} — ${countDescByCode.get(r.countCode)}` : r.countCode) : "—"}</td>
                    <td className="num">{fmt(Number(r.contracts))}</td>
                    <td className="num">{fmt(Number(r.totalBags))}</td>
                    <td className="num">{fmt(r.avgRate, 2)}</td>
                    <td className="num">{fmt(Number(r.totalAmount))}</td>
                  </tr>
                ))
              )}
            </tbody>
            {enriched.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ textAlign: "right" }}>Grand Total</td>
                  <td className="num">{fmt(grandContracts)}</td>
                  <td className="num">{fmt(grandBags)}</td>
                  <td className="num">{fmt(grandAvgRate, 2)}</td>
                  <td className="num">{fmt(grandAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>

          <div className="rp-signatures">
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Prepared By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Checked By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Approved By</div></div>
          </div>

          <div className="rp-footer">Weighted average = SUM(bags × rate) / SUM(bags). Purchase contracts only.</div>
        </div>
      </div>
    </>
  );
}
