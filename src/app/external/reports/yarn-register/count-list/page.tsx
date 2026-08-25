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

type Row = {
  type: "PUR" | "SAL";
  contNo: string;
  contDate: string;
  party: string | null;
  countCode: string | null;
  brand: string | null;
  qtyBags: number | null;
  ratePerLbs: number | null;
  amount: number | null;
};

export default async function CountListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; code?: string; brand?: string; party?: string }>;
}) {
  await requireSession();

  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const code = params.code?.trim() ?? "";
  const brand = params.brand?.trim() ?? "";
  const party = params.party?.trim() ?? "";

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const purConditions = [
    gte(schema.extYarnPurContract.contDate, from),
    lte(schema.extYarnPurContract.contDate, to),
  ];
  const salConditions = [
    gte(schema.extYarnSalContract.contDate, from),
    lte(schema.extYarnSalContract.contDate, to),
  ];
  if (code) {
    const pat = `%${escLike(code)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.countCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.countCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (brand) {
    const pat = `%${escLike(brand)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.brand} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.brand} LIKE ${pat} ESCAPE '\\'`);
  }
  if (party) {
    const pat = `%${escLike(party)}%`;
    purConditions.push(sql`${schema.extYarnPurContract.partyCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extYarnSalContract.partyCode} LIKE ${pat} ESCAPE '\\'`);
  }

  const purRows = await db.select().from(schema.extYarnPurContract).where(and(...purConditions));
  const salRows = await db.select().from(schema.extYarnSalContract).where(and(...salConditions));

  const accountRows = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const partyDescByCode = new Map(accountRows.map((r) => [r.code, r.description]));
  const countLookup = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts);
  const countDescByCode = new Map(countLookup.map((r) => [r.countCode, r.description]));

  const combined: Row[] = [
    ...purRows.map((r) => ({
      type: "PUR" as const,
      contNo: r.contNo,
      contDate: r.contDate,
      party: r.partyCode,
      countCode: r.countCode,
      brand: r.brand,
      qtyBags: r.qtyBags,
      ratePerLbs: r.ratePerLbs,
      amount: r.amount,
    })),
    ...salRows.map((r) => ({
      type: "SAL" as const,
      contNo: r.contNo,
      contDate: r.contDate,
      party: r.partyCode,
      countCode: r.countCode,
      brand: r.brand,
      qtyBags: r.qtyBags,
      ratePerLbs: r.ratePerLbs,
      amount: r.amount,
    })),
  ].sort((a, b) => {
    const cmp = (a.countCode ?? "").localeCompare(b.countCode ?? "");
    if (cmp !== 0) return cmp;
    return (a.contDate ?? "").localeCompare(b.contDate ?? "");
  });

  const totalBags = combined.reduce((s, r) => s + (r.qtyBags ?? 0), 0);
  const totalAmount = combined.reduce((s, r) => s + (r.amount ?? 0), 0);

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
          border: 1px solid #000; padding: 5px 7px; font-size: 10pt;
          font-family: 'Georgia', 'Times New Roman', serif; text-align: left; vertical-align: top;
        }
        table.rp-table th {
          background: #fff; font-family: 'Helvetica', Arial, sans-serif; font-size: 8.5pt;
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

          <div className="rp-title">COUNT LISTING</div>

          <div className="rp-filter">
            Period: {from} to {to}
            {code ? ` · Count: ${code}` : ""}
            {brand ? ` · Brand: ${brand}` : ""}
            {party ? ` · Party: ${party}` : ""}
          </div>

          <table className="rp-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>#</th>
                <th>Type</th>
                <th>Cont No</th>
                <th>Date</th>
                <th>Party</th>
                <th>Count Code</th>
                <th>Brand</th>
                <th className="num">Qty Bags</th>
                <th className="num">Rate</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {combined.length === 0 ? (
                <tr>
                  <td colSpan={10} className="rp-empty">No contracts found for the selected filters.</td>
                </tr>
              ) : (
                combined.map((r, i) => (
                  <tr key={`${r.type}-${r.contNo}`}>
                    <td>{i + 1}</td>
                    <td>{r.type}</td>
                    <td>{r.contNo}</td>
                    <td>{r.contDate}</td>
                    <td>{r.party ? (partyDescByCode.get(r.party) ? `${r.party} — ${partyDescByCode.get(r.party)}` : r.party) : "—"}</td>
                    <td>{r.countCode ? (countDescByCode.get(r.countCode) ? `${r.countCode} — ${countDescByCode.get(r.countCode)}` : r.countCode) : "—"}</td>
                    <td>{r.brand ?? "—"}</td>
                    <td className="num">{fmt(r.qtyBags)}</td>
                    <td className="num">{fmt(r.ratePerLbs, 2)}</td>
                    <td className="num">{fmt(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {combined.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ textAlign: "right" }}>Grand Total</td>
                  <td className="num">{fmt(totalBags)}</td>
                  <td></td>
                  <td className="num">{fmt(totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>

          <div className="rp-signatures">
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Prepared By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Checked By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Approved By</div></div>
          </div>

          <div className="rp-footer">Sorted by Count Code, then Date. Includes Purchase and Sales contracts.</div>
        </div>
      </div>
    </>
  );
}
