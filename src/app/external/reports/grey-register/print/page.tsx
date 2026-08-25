import { db, schema } from "@/db";
import { and, gte, lte, eq, sql, or } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { today as todayFn, monthsAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function sixMonthsAgo(): string {
  return monthsAgo(6);
}

type Row = {
  type: "PUR" | "SAL";
  contractNo: string;
  contractDate: string;
  party: string | null;
  greyCode: string | null;
  weave: string | null;
  quantityMtr: number | null;
  ratePerMtr: number | null;
  amount: number | null;
  status: string;
};

export default async function GreyRegisterPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    shortTittle?: string;
    tittle?: string;
    code?: string;
    status?: string;
    reg2_code?: string;
    reg2_desc?: string;
    reg2_printcode?: string;
    reg2_desc2?: string;
  }>;
}) {
  await requireSession();
  const params = await searchParams;

  const today = todayFn();
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const shortTittle = params.shortTittle?.trim() ?? "";
  const tittle = params.tittle?.trim() ?? "";
  const code = params.code?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const reg2Code = params.reg2_code?.trim() ?? "";
  const reg2Desc = params.reg2_desc?.trim() ?? "";
  const reg2PrintCode = params.reg2_printcode?.trim() ?? "";
  const reg2Desc2 = params.reg2_desc2?.trim() ?? "";

  const purConditions = [
    gte(schema.extGreyPurContract.contractDate, from),
    lte(schema.extGreyPurContract.contractDate, to),
  ];
  const salConditions = [
    gte(schema.extGreySalContract.contractDate, from),
    lte(schema.extGreySalContract.contractDate, to),
  ];

  if (shortTittle) {
    const pat = `%${escLike(shortTittle)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.greyCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.greyCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (tittle) {
    const pat = `%${escLike(tittle)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.party} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.party} LIKE ${pat} ESCAPE '\\'`);
  }
  if (code) {
    const pat = `%${escLike(code)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.contractNo} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.contractNo} LIKE ${pat} ESCAPE '\\'`);
  }
  if (status) {
    purConditions.push(eq(schema.extGreyPurContract.status, status));
    salConditions.push(eq(schema.extGreySalContract.status, status));
  }
  if (reg2Code) {
    const pat = `%${escLike(reg2Code)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.greyCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.greyCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (reg2Desc) {
    const pat = `%${escLike(reg2Desc)}%`;
    purConditions.push(
      or(
        sql`${schema.extGreyPurContract.weave} LIKE ${pat} ESCAPE '\\'`,
        sql`${schema.extGreyPurContract.remarks} LIKE ${pat} ESCAPE '\\'`,
      )!
    );
    salConditions.push(
      or(
        sql`${schema.extGreySalContract.weave} LIKE ${pat} ESCAPE '\\'`,
        sql`${schema.extGreySalContract.remarks} LIKE ${pat} ESCAPE '\\'`,
      )!
    );
  }
  if (reg2PrintCode) {
    const pat = `%${escLike(reg2PrintCode)}%`;
    purConditions.push(
      or(
        sql`${schema.extGreyPurContract.greyCode} LIKE ${pat} ESCAPE '\\'`,
        sql`${schema.extGreyPurContract.remarks} LIKE ${pat} ESCAPE '\\'`,
      )!
    );
    salConditions.push(
      or(
        sql`${schema.extGreySalContract.greyCode} LIKE ${pat} ESCAPE '\\'`,
        sql`${schema.extGreySalContract.remarks} LIKE ${pat} ESCAPE '\\'`,
      )!
    );
  }
  if (reg2Desc2) {
    const pat = `%${escLike(reg2Desc2)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.remarks} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.remarks} LIKE ${pat} ESCAPE '\\'`);
  }

  const [purRows, salRows, companyRows, partyRows, greyRows] = await Promise.all([
    db.select().from(schema.extGreyPurContract).where(and(...purConditions)),
    db.select().from(schema.extGreySalContract).where(and(...salConditions)),
    db.select().from(schema.companyProfile).limit(1),
    db.select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description }).from(schema.chartOfAccounts),
    db.select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description }).from(schema.greyConstruction),
  ]);
  const company = companyRows[0];
  const partyCodeByDesc = new Map(partyRows.map((p) => [p.description, p.code]));
  const greyDescByCode = new Map(greyRows.map((g) => [g.code, g.description]));

  const combined: Row[] = [
    ...purRows.map((r) => ({
      type: "PUR" as const,
      contractNo: r.contractNo,
      contractDate: r.contractDate,
      party: r.party,
      greyCode: r.greyCode,
      weave: r.weave,
      quantityMtr: r.quantityMtr,
      ratePerMtr: r.ratePerMtr,
      amount: r.amount,
      status: r.status,
    })),
    ...salRows.map((r) => ({
      type: "SAL" as const,
      contractNo: r.contractNo,
      contractDate: r.contractDate,
      party: r.party,
      greyCode: r.greyCode,
      weave: r.weave,
      quantityMtr: r.quantityMtr,
      ratePerMtr: r.ratePerMtr,
      amount: r.amount,
      status: r.status,
    })),
  ].sort((a, b) => (b.contractDate ?? "").localeCompare(a.contractDate ?? ""));

  const totalQty = combined.reduce((s, r) => s + (r.quantityMtr ?? 0), 0);
  const totalAmount = combined.reduce((s, r) => s + (r.amount ?? 0), 0);

  const filterSummary: string[] = [];
  if (shortTittle) filterSummary.push(`Short Tittle: ${shortTittle}`);
  if (tittle) filterSummary.push(`Tittle: ${tittle}`);
  if (code) filterSummary.push(`Code: ${code}`);
  if (status) filterSummary.push(`Status: ${status}`);
  if (reg2Code) filterSummary.push(`Grey Code: ${reg2Code}`);
  if (reg2Desc) filterSummary.push(`Description: ${reg2Desc}`);
  if (reg2PrintCode) filterSummary.push(`Print Code: ${reg2PrintCode}`);
  if (reg2Desc2) filterSummary.push(`Remarks: ${reg2Desc2}`);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .rpt-wrap { padding: 0 !important; background: #fff !important; }
          .rpt-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
        }
        .rpt-wrap { background: #f5f5f5; min-height: 100vh; padding: 32px 16px; }
        .rpt-toolbar {
          max-width: 210mm; margin: 0 auto 20px;
          display: flex; justify-content: space-between; align-items: center; gap: 12px;
          padding: 12px 16px; border: 1px solid #000; background: #fff;
        }
        .rpt-toolbar-title {
          font-family: 'Georgia','Times New Roman',serif;
          font-size: 20pt; font-weight: 700; letter-spacing: 0.08em;
        }
        .rpt-page {
          background: #fff; color: #000; max-width: 210mm; margin: 0 auto;
          padding: 22mm 18mm; border: 1px solid #000;
          font-family: 'Georgia','Times New Roman',serif; font-size: 11pt; line-height: 1.45;
        }
        .rpt-page .company-name { font-size: 24pt; font-weight: 700; text-align: center; margin: 0; letter-spacing: 0.02em; }
        .rpt-page .company-meta { text-align: center; font-size: 10pt; margin-top: 4px; }
        .rpt-page .doc-title {
          text-align: center; font-size: 16pt; font-weight: 700;
          letter-spacing: 0.28em; margin: 12px 0 12px;
          padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;
        }
        .rpt-page .meta { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 10px; }
        .rpt-page .filters { font-size: 9pt; margin-bottom: 12px; font-family: 'Helvetica',Arial,sans-serif; }
        .rpt-page table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
        .rpt-page table.items th, .rpt-page table.items td {
          border: 1px solid #000; padding: 4px 6px; font-size: 9.5pt;
          font-family: 'Georgia','Times New Roman',serif; text-align: left; vertical-align: top;
        }
        .rpt-page table.items th {
          background: #fff; font-family: 'Helvetica',Arial,sans-serif;
          font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
        }
        .rpt-page table.items td.num, .rpt-page table.items th.num {
          text-align: right; font-variant-numeric: tabular-nums;
        }
        .rpt-page table.items tfoot td {
          font-weight: 700; border-top: 2px solid #000; font-size: 10pt;
        }
        .rpt-page .signatures { margin-top: 42px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
        .rpt-page .sig { text-align: center; }
        .rpt-page .sig-line { border-top: 1px solid #000; margin-bottom: 6px; height: 32px; }
        .rpt-page .sig-label {
          font-family: 'Helvetica',Arial,sans-serif; font-size: 9pt; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
        }
        .rpt-page .footer { margin-top: 26px; font-size: 8.5pt; text-align: center; color: #333; letter-spacing: 0.05em; }
      `}</style>

      <div className="rpt-wrap">
        <div className="rpt-toolbar no-print">
          <div className="rpt-toolbar-title">GREY REGISTER</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a href="/external/reports/grey-register" className="btn btn-outline btn-sm">Back</a>
            <PrintButton label="Print Register" />
          </div>
        </div>

        <div className="rpt-page">
          <div className="company-name">{company?.name ?? "Company Name"}</div>
          <div className="company-meta">
            {[company?.address, company?.city].filter(Boolean).join(", ") || "Address"}
            {company?.phone ? ` — Phone: ${company.phone}` : ""}
          </div>

          <div className="doc-title">GREY REGISTER</div>

          <div className="meta">
            <div><strong>Period:</strong> {from} to {to}</div>
            <div><strong>Printed:</strong> {today}</div>
          </div>
          {filterSummary.length > 0 && (
            <div className="filters">
              <strong>Filters:</strong> {filterSummary.join(" | ")}
            </div>
          )}

          <table className="items">
            <thead>
              <tr>
                <th style={{ width: "44px" }}>Type</th>
                <th style={{ width: "110px" }}>Contract No</th>
                <th style={{ width: "90px" }}>Contract Date</th>
                <th>Party</th>
                <th style={{ width: "110px" }}>Grey Code</th>
                <th>Weave</th>
                <th className="num" style={{ width: "80px" }}>Qty Mtr</th>
                <th className="num" style={{ width: "70px" }}>Rate/Mtr</th>
                <th className="num" style={{ width: "110px" }}>Amount</th>
                <th style={{ width: "50px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {combined.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "16px" }}>
                    No records found for the selected period
                  </td>
                </tr>
              ) : (
                combined.map((r, i) => (
                  <tr key={`${r.type}-${r.contractNo}-${i}`}>
                    <td>{r.type}</td>
                    <td>{r.contractNo}</td>
                    <td>{r.contractDate}</td>
                    <td>{r.party ? `${r.party}${partyCodeByDesc.get(r.party) ? ` (${partyCodeByDesc.get(r.party)})` : ""}` : "-"}</td>
                    <td>{r.greyCode ? `${r.greyCode}${greyDescByCode.get(r.greyCode) ? ` — ${greyDescByCode.get(r.greyCode)}` : ""}` : "-"}</td>
                    <td>{r.weave ?? "-"}</td>
                    <td className="num">{r.quantityMtr != null ? fmt(r.quantityMtr) : "-"}</td>
                    <td className="num">{r.ratePerMtr != null ? fmt(r.ratePerMtr) : "-"}</td>
                    <td className="num">{r.amount != null ? fmt(r.amount) : "-"}</td>
                    <td>{r.status || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
            {combined.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: "right" }}>GRAND TOTAL</td>
                  <td className="num">{fmt(totalQty)}</td>
                  <td className="num"></td>
                  <td className="num">Rs {fmt(totalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>

          <div className="signatures">
            <div className="sig">
              <div className="sig-line" />
              <div className="sig-label">Prepared By</div>
            </div>
            <div className="sig">
              <div className="sig-line" />
              <div className="sig-label">Checked By</div>
            </div>
            <div className="sig">
              <div className="sig-line" />
              <div className="sig-label">Received By</div>
            </div>
          </div>

          <div className="footer">This is a computer generated report.</div>
        </div>
      </div>
    </>
  );
}
