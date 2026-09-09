import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { numberToWords } from "@/lib/number-to-words";
import { QrImage } from "@/app/weaving/beams/qr/qr-image";

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
    .from(schema.intGreyDespatch)
    .where(eq(schema.intGreyDespatch.id, despatchId))
    .limit(1);

  if (!despatch) notFound();

  const lines = await db
    .select()
    .from(schema.intGreyDespatchLine)
    .where(eq(schema.intGreyDespatchLine.despatchId, despatchId))
    .orderBy(schema.intGreyDespatchLine.srNo);

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const totalMeters = lines.reduce((s, l) => s + (l.lengthMtrs ?? 0), 0);
  const totalThan = despatch.thanQty ?? lines.length;

  const partyName = despatch.party ?? despatch.doParty ?? despatch.despatchTo ?? "—";

  // Organize lines into 4 columns to perfectly match the requested "Delivery Voucher" image layout.
  // Calculate exactly 1/4th of the list rounded up for column length.
  const colLength = Math.max(1, Math.ceil(lines.length / 4));
  const gridRows = [];
  for (let r = 0; r < colLength; r++) {
    const rData = [];
    for (let c = 0; c < 4; c++) {
      const idx = c * colLength + r;
      if (idx < lines.length) {
        rData.push({ sNo: idx + 1, mtrs: lines[idx].lengthMtrs });
      } else {
        rData.push({ sNo: null, mtrs: null });
      }
    }
    gridRows.push(rData);
  }

  // Column totals
  const colTotals = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    let sum = 0;
    for (let r = 0; r < colLength; r++) {
      const idx = c * colLength + r;
      if (idx < lines.length && lines[idx].lengthMtrs) {
        sum += lines[idx].lengthMtrs;
      }
    }
    colTotals[c] = sum;
  }

  // Create word representation without the "Rupees" prefix
  let words = numberToWords(totalMeters, "");
  if (words.startsWith(" ")) words = words.slice(1);
  if (words) {
    words = "(" + words.charAt(0).toUpperCase() + words.slice(1) + ")";
  }

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 8mm 12mm; }
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
          background: var(--bg);
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
          padding: 12mm 10mm;
          border: 1px solid var(--border);
          font-family: 'Arial', sans-serif;
          font-size: 10pt;
          line-height: 1.35;
        }
        
        .header-container {
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .header-left {
          flex: 1;
        }
        
        .header-right {
          width: 320px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .meta-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 8px;
        }
        
        .meta-table td {
          padding: 3px 0;
          border: none;
          vertical-align: top;
          font-size: 10pt;
        }
        
        .meta-label {
          width: 110px;
          color: #555;
        }
        
        .meta-val {
          font-weight: 600;
          text-transform: uppercase;
        }

        .doc-title {
          font-size: 22pt;
          font-weight: 700;
          text-align: center;
          margin: -10px 0 10px;
          color: #333;
        }
        
        .logo-box {
          width: 200px;
          height: 80px;
          background: transparent;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          position: relative;
        }

        .summary-box {
          width: 100%;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          border-bottom: 1px dotted #ccc;
          padding-bottom: 2px;
        }

        .summary-val {
          font-weight: 700;
          font-size: 11pt;
        }

        .words-val {
          font-size: 9pt;
          font-style: italic;
          text-align: right;
          margin-top: -4px;
          margin-bottom: 12px;
        }

        table.grid {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #ccc;
          margin-top: 10px;
        }

        table.grid th, table.grid td {
          border: 1px solid #ccc;
          padding: 4px 6px;
          font-size: 9.5pt;
        }

        table.grid th {
          background: #f0f0f0;
          color: #000;
          font-weight: 600;
          text-align: right;
          border-bottom: 1px solid #ccc;
        }

        table.grid th:nth-child(odd) {
          text-align: center;
          width: 45px;
        }

        table.grid td:nth-child(odd) {
          text-align: center;
          color: #555;
        }

        table.grid td:nth-child(even) {
          text-align: right;
          font-weight: 600;
        }

        .grid-totals {
          background: #e8e8e8;
          font-weight: bold !important;
        }

        .signatures {
          margin-top: 60px;
          display: flex;
          justify-content: space-between;
          padding: 0 20px;
        }

        .sig-box {
          text-align: center;
        }
        
        .sig-line {
          width: 140px;
          border-top: 1px solid #000;
          margin-bottom: 8px;
        }
        
        .sig-label {
          font-size: 9.5pt;
          color: #555;
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
          <PrintButton label="Print Delivery Voucher" />
        </div>

        <div className="chalan-page">
          <div className="doc-title">Delivery Voucher</div>
          
          <div className="header-container">
            <div className="header-left">
              <table className="meta-table">
                <tbody>
                  <tr>
                    <td className="meta-label">Book.#</td>
                    <td className="meta-val">{despatch.vNo}</td>
                  </tr>
                  <tr>
                    <td className="meta-label">Date</td>
                    <td className="meta-val">{despatch.vDate}</td>
                  </tr>
                  <tr>
                    <td className="meta-label">Party</td>
                    <td className="meta-val">{partyName}</td>
                  </tr>
                  <tr>
                    <td className="meta-label">Contract #</td>
                    <td className="meta-val">{despatch.convContNo ?? ""}</td>
                  </tr>
                  <tr>
                    <td className="meta-label">Despatch Loc</td>
                    <td className="meta-val">{despatch.despatchLocation ?? ""}</td>
                  </tr>
                  <tr>
                    <td className="meta-label">Product</td>
                    <td className="meta-val">{despatch.productBrand ?? ""}</td>
                  </tr>
                  <tr>
                    <td className="meta-label">Grey</td>
                    <td className="meta-val">{despatch.greyCode ?? ""}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="header-right">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', justifyContent: 'flex-end', width: '100%' }}>
                <div style={{ textAlign: 'center', fontSize: '8pt', color: '#555' }}>
                  <QrImage value="https://wa.me/923232201515" size={65} />
                  <div style={{ marginTop: '2px', fontWeight: 'bold' }}>WhatsApp Us</div>
                </div>
                <div className="logo-box" style={{ marginBottom: 0 }}>
                  {/* User-requested SK Textile Logo */}
                  <img src="/sk-logo.png" alt="SK Textile" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'right' }} />
                </div>
              </div>
              <div className="summary-box">
                <div className="summary-row">
                  <span className="meta-label">Than</span>
                  <span className="summary-val">{formatNum(totalThan)}</span>
                </div>
                <div className="summary-row">
                  <span className="meta-label">Meters Tot.</span>
                  <span className="summary-val">{formatNum(totalMeters)}</span>
                </div>
                <div className="words-val">{words}</div>
              </div>
            </div>
          </div>

          <table className="grid">
            <thead>
              <tr>
                <th>S#</th>
                <th>Mtrs</th>
                <th>S#</th>
                <th>Mtrs</th>
                <th>S#</th>
                <th>Mtrs</th>
                <th>S#</th>
                <th>Mtrs</th>
              </tr>
            </thead>
            <tbody>
              {gridRows.length > 0 ? (
                gridRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <React.Fragment key={cIdx}>
                        <td>{cell.sNo ?? ""}</td>
                        <td>{cell.mtrs != null ? formatNum(cell.mtrs) : ""}</td>
                      </React.Fragment>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "20px" }}>No line items recorded.</td>
                </tr>
              )}
              {gridRows.length > 0 && (
                <tr className="grid-totals">
                  <td></td>
                  <td>{colTotals[0] > 0 ? formatNum(colTotals[0]) : ""}</td>
                  <td></td>
                  <td>{colTotals[1] > 0 ? formatNum(colTotals[1]) : ""}</td>
                  <td></td>
                  <td>{colTotals[2] > 0 ? formatNum(colTotals[2]) : ""}</td>
                  <td></td>
                  <td>{colTotals[3] > 0 ? formatNum(colTotals[3]) : ""}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="signatures">
            <div className="sig-box">
              <div className="sig-line" />
              <div className="sig-label">Prepared By</div>
            </div>
            <div className="sig-box">
              <div className="sig-line" />
              <div className="sig-label">Checked By</div>
            </div>
            <div className="sig-box">
              <div className="sig-line" />
              <div className="sig-label">Approved By</div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
