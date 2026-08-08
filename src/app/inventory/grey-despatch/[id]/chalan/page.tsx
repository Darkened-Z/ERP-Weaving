import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function GreyDespatchChalanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();

  const { id } = await params;
  const despatchId = Number(id);
  if (!Number.isFinite(despatchId)) notFound();

  const [despatch] = await db
    .select()
    .from(schema.greyDespatch)
    .where(eq(schema.greyDespatch.id, despatchId))
    .limit(1);

  if (!despatch) notFound();

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .chalan-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
          }
          .chalan-wrap { padding: 0 !important; background: #fff !important; }
        }
        .chalan-wrap {
          background: #f5f5f5;
          min-height: 100vh;
          padding: 32px 16px;
        }
        .chalan-toolbar {
          max-width: 210mm;
          margin: 0 auto 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .chalan-page {
          background: #fff;
          color: #000;
          max-width: 210mm;
          margin: 0 auto;
          padding: 22mm 18mm;
          border: 1px solid #000;
          font-family: 'Georgia', 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.45;
        }
        .chalan-page .company-name {
          font-family: 'Georgia', 'Times New Roman', serif;
          font-size: 26pt;
          font-weight: 700;
          letter-spacing: 0.02em;
          margin: 0;
          text-align: center;
        }
        .chalan-page .company-meta {
          text-align: center;
          font-size: 10pt;
          margin-top: 4px;
          line-height: 1.4;
        }
        .chalan-page .company-ids {
          text-align: center;
          font-size: 9.5pt;
          margin-top: 4px;
          letter-spacing: 0.04em;
        }
        .chalan-page .rule {
          border: 0;
          border-top: 2px solid #000;
          margin: 14px 0 10px;
        }
        .chalan-page .rule-thin {
          border: 0;
          border-top: 1px solid #000;
          margin: 10px 0;
        }
        .chalan-page .doc-title {
          text-align: center;
          font-size: 18pt;
          font-weight: 700;
          letter-spacing: 0.28em;
          margin: 6px 0 18px;
          padding: 6px 0;
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          font-family: 'Georgia', 'Times New Roman', serif;
        }
        .chalan-page .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 32px;
          margin-bottom: 16px;
          font-size: 11pt;
        }
        .chalan-page .meta-row {
          display: flex;
          gap: 8px;
          border-bottom: 1px dotted #000;
          padding: 3px 0;
        }
        .chalan-page .meta-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          min-width: 92px;
          color: #000;
        }
        .chalan-page .meta-value {
          flex: 1;
          font-weight: 600;
        }
        .chalan-page .party-block {
          border: 1px solid #000;
          padding: 10px 14px;
          margin: 14px 0 18px;
        }
        .chalan-page .party-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .chalan-page .party-name {
          font-size: 16pt;
          font-weight: 700;
          margin-top: 2px;
        }
        .chalan-page table.items {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        .chalan-page table.items th,
        .chalan-page table.items td {
          border: 1px solid #000;
          padding: 10px 10px;
          font-size: 11pt;
          font-family: 'Georgia', 'Times New Roman', serif;
          text-align: left;
          vertical-align: top;
        }
        .chalan-page table.items th {
          background: #fff;
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 9pt;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-align: left;
        }
        .chalan-page table.items th.num,
        .chalan-page table.items td.num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .chalan-page table.items td.sr {
          text-align: center;
          width: 32px;
        }
        .chalan-page table.items tr.blank td {
          height: 26px;
          color: transparent;
        }
        .chalan-page .totals {
          display: flex;
          justify-content: flex-end;
          gap: 40px;
          margin-top: 12px;
          padding: 8px 10px;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          font-size: 11pt;
        }
        .chalan-page .total-item {
          display: flex;
          gap: 10px;
          align-items: baseline;
        }
        .chalan-page .total-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 9pt;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .chalan-page .total-value {
          font-weight: 700;
          font-size: 13pt;
          font-variant-numeric: tabular-nums;
        }
        .chalan-page .notes {
          margin-top: 22px;
          font-size: 9.5pt;
          border: 1px solid #000;
          padding: 8px 12px;
          min-height: 52px;
        }
        .chalan-page .notes-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .chalan-page .signatures {
          margin-top: 42px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 24px;
        }
        .chalan-page .sig {
          text-align: center;
        }
        .chalan-page .sig-line {
          border-top: 1px solid #000;
          margin-bottom: 6px;
          height: 32px;
        }
        .chalan-page .sig-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 9pt;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .chalan-page .footer {
          margin-top: 26px;
          font-size: 8.5pt;
          text-align: center;
          color: #333;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="chalan-wrap">
        <div className="chalan-toolbar no-print">
          <Link
            href="/inventory/grey-despatch"
            className="btn btn-outline btn-sm no-print"
          >
            Back
          </Link>
          <PrintButton label="Print Chalan" />
        </div>

        <div className="chalan-page">
          <div className="company-name">
            {company?.name ?? "Company Name"}
          </div>
          <div className="company-meta">
            {[company?.address, company?.city].filter(Boolean).join(", ") ||
              "Address"}
            {company?.phone ? ` — Phone: ${company.phone}` : ""}
          </div>

          <div className="doc-title">DELIVERY CHALAN</div>

          <div className="meta-grid">
            <div className="meta-row">
              <span className="meta-label">Chalan No</span>
              <span className="meta-value">{despatch.despatchNo}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Date</span>
              <span className="meta-value">{despatch.despatchDate}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">FY Code</span>
              <span className="meta-value">{despatch.fyCode}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Vehicle No</span>
              <span className="meta-value">{despatch.vehicleNo ?? "—"}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Bilty No</span>
              <span className="meta-value">{despatch.biltyNo ?? "—"}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Gate Pass</span>
              <span className="meta-value">{despatch.gatePassNo ?? "—"}</span>
            </div>
          </div>

          <div className="party-block">
            <div className="party-label">M/s.</div>
            <div className="party-name">{despatch.party}</div>
          </div>

          <table className="items">
            <thead>
              <tr>
                <th style={{ width: "36px" }}>#</th>
                <th>Description</th>
                <th className="num" style={{ width: "90px" }}>
                  Rolls
                </th>
                <th className="num" style={{ width: "110px" }}>
                  Meters
                </th>
                <th style={{ width: "150px" }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sr">1</td>
                <td>{despatch.product ?? "Grey Cloth"}</td>
                <td className="num">
                  {despatch.rolls != null ? formatNum(despatch.rolls) : "—"}
                </td>
                <td className="num">
                  {despatch.meters != null ? formatNum(despatch.meters) : "—"}
                </td>
                <td></td>
              </tr>
              <tr className="blank">
                <td>.</td>
                <td>.</td>
                <td>.</td>
                <td>.</td>
                <td>.</td>
              </tr>
              <tr className="blank">
                <td>.</td>
                <td>.</td>
                <td>.</td>
                <td>.</td>
                <td>.</td>
              </tr>
              <tr className="blank">
                <td>.</td>
                <td>.</td>
                <td>.</td>
                <td>.</td>
                <td>.</td>
              </tr>
            </tbody>
          </table>

          <div className="totals">
            <div className="total-item">
              <span className="total-label">Total Rolls</span>
              <span className="total-value">
                {despatch.rolls != null ? formatNum(despatch.rolls) : "—"}
              </span>
            </div>
            <div className="total-item">
              <span className="total-label">Total Meters</span>
              <span className="total-value">
                {despatch.meters != null ? formatNum(despatch.meters) : "—"}
              </span>
            </div>
          </div>

          <div className="notes">
            <div className="notes-label">Remarks</div>
          </div>

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

          <div className="footer">
            This is a computer generated delivery chalan.
          </div>
        </div>
      </div>
    </>
  );
}
