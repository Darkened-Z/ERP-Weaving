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

  // Fetch full grey construction details if available
  let greyConst: typeof schema.greyConstruction.$inferSelect | null = null;
  if (despatch.greyCode) {
    const [gc] = await db
      .select()
      .from(schema.greyConstruction)
      .where(eq(schema.greyConstruction.code, despatch.greyCode))
      .limit(1);
    greyConst = gc ?? null;
  }

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const totalMeters = lines.reduce((s, l) => s + (l.lengthMtrs ?? 0), 0);
  const totalThan = lines.length;

  const partyName = despatch.party ?? despatch.doParty ?? despatch.despatchTo ?? "";

  // Build grey construction label: "Width x Pick  Count/Type  Blend x Count/Type Blend"
  // Use greyConst if available, else fall back to despatch.greyCode
  let greyLabel = despatch.greyCode ?? "";
  if (greyConst) {
    const parts: string[] = [];
    if (greyConst.description) parts.push(greyConst.description);
    greyLabel = parts.join("  ") || greyLabel;
  }

  // Width — prefer greyConst.width, fall back to despatch.width
  const widthVal = (greyConst?.width ?? (despatch as { width?: number | null }).width) ?? null;
  const widthLabel = widthVal != null ? `${formatNum(widthVal)}"` : "";

  // Organize lines into 4 columns
  const colLength = Math.max(1, Math.ceil(lines.length / 4));
  const gridRows: { sNo: number | null; mtrs: number | null }[][] = [];
  for (let r = 0; r < colLength; r++) {
    const rData: { sNo: number | null; mtrs: number | null }[] = [];
    for (let c = 0; c < 4; c++) {
      const idx = c * colLength + r;
      if (idx < lines.length) {
        rData.push({ sNo: idx + 1, mtrs: lines[idx].lengthMtrs ?? null });
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
        sum += lines[idx].lengthMtrs!;
      }
    }
    colTotals[c] = sum;
  }

  // Total in words
  let words = numberToWords(totalMeters, "");
  if (words.startsWith(" ")) words = words.slice(1);
  if (words) {
    words = "(" + words.charAt(0).toUpperCase() + words.slice(1) + " Meters)";
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
          padding: 10mm 10mm;
          border: 1px solid var(--border);
          font-family: 'Arial', sans-serif;
          font-size: 10pt;
          line-height: 1.4;
        }

        /* Title row */
        .title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
        }
        .doc-title {
          font-size: 20pt;
          font-weight: 700;
          color: #222;
          line-height: 1;
        }
        .logo-qr-block {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logo-img {
          height: 64px;
          width: auto;
          object-fit: contain;
        }

        /* Meta info grid */
        .meta-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 24px;
          margin-bottom: 12px;
        }
        .meta-row {
          display: flex;
          align-items: baseline;
          border-bottom: 1px solid #ddd;
          padding: 3px 0;
          margin-bottom: 2px;
        }
        .meta-label {
          font-size: 9pt;
          color: #555;
          width: 105px;
          flex-shrink: 0;
        }
        .meta-val {
          font-weight: 700;
          font-size: 10pt;
          text-transform: uppercase;
          flex: 1;
          /* handwritten-feel: allow long values to wrap */
          word-break: break-word;
        }
        /* handwritten-style underline input — shows blank line when no value */
        .meta-handwrite {
          font-weight: 700;
          font-size: 10pt;
          flex: 1;
          border-bottom: 1px solid #000;
          min-width: 120px;
          padding-bottom: 1px;
          text-transform: uppercase;
        }

        /* Summary strip */
        .summary-strip {
          display: flex;
          gap: 24px;
          justify-content: flex-end;
          margin-bottom: 10px;
          font-size: 10pt;
        }
        .summary-item {
          display: flex;
          gap: 6px;
          align-items: baseline;
        }
        .summary-label { color: #555; }
        .summary-val { font-weight: 700; font-size: 12pt; }

        .words-val {
          font-size: 8.5pt;
          font-style: italic;
          text-align: right;
          margin-bottom: 8px;
          color: #444;
        }

        /* Grid of piece lengths */
        table.grid {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #aaa;
          margin-top: 6px;
        }
        table.grid th, table.grid td {
          border: 1px solid #bbb;
          padding: 3px 6px;
          font-size: 9.5pt;
        }
        table.grid th {
          background: #e8eef6;
          color: #1e3a8a;
          font-weight: 700;
          text-align: center;
        }
        table.grid th:nth-child(even) {
          text-align: right;
        }
        table.grid td:nth-child(odd) {
          text-align: center;
          color: #555;
          width: 40px;
        }
        table.grid td:nth-child(even) {
          text-align: right;
          font-weight: 600;
        }
        .grid-totals td {
          background: #dce8f8;
          font-weight: 700 !important;
          border-top: 2px solid #aaa;
        }

        .grand-total-row {
          margin-top: 8px;
          display: flex;
          justify-content: flex-end;
          gap: 32px;
          font-size: 11pt;
          font-weight: 700;
          border-top: 2px solid #333;
          padding-top: 6px;
        }
        .grand-total-row span { color: #1e3a8a; }

        /* Signatures */
        .signatures {
          margin-top: 48px;
          display: flex;
          justify-content: space-between;
          padding: 0 20px;
        }
        .sig-box { text-align: center; }
        .sig-line { width: 130px; border-top: 1px solid #000; margin-bottom: 6px; }
        .sig-label { font-size: 9pt; color: #555; }
      `}</style>

      <div className="chalan-wrap">
        <div className="chalan-toolbar no-print">
          <Link href="/inventory/grey-despatch" className="btn btn-outline btn-sm no-print">
            Back
          </Link>
          <PrintButton label="Print Delivery Voucher" />
        </div>

        <div className="chalan-page">

          {/* ── Title + Logo/QR ── */}
          <div className="title-row">
            <div className="doc-title">Delivery Voucher</div>
            <div className="logo-qr-block">
              <div style={{ textAlign: 'center', fontSize: '7.5pt', color: '#555' }}>
                <QrImage value="https://wa.me/923232201515" size={56} />
                <div style={{ marginTop: '2px', fontWeight: 'bold' }}>WhatsApp Us</div>
              </div>
              <img src="/sk-logo.png" alt="SK Textile" className="logo-img" />
            </div>
          </div>

          {/* ── Meta fields in two columns ── */}
          <div className="meta-section">

            {/* LEFT COLUMN */}
            <div>
              <div className="meta-row">
                <span className="meta-label">Book #</span>
                <span className="meta-val">{despatch.vNo}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Date</span>
                <span className="meta-val">{despatch.vDate}</span>
              </div>
              {/* Party — handwritten style underline, user fills in manually */}
              <div className="meta-row">
                <span className="meta-label">Party</span>
                <span className="meta-handwrite">{partyName}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Contract #</span>
                <span className="meta-val">{despatch.convContNo ?? ""}</span>
              </div>
              {/* Despatch Location — handwritten style */}
              <div className="meta-row">
                <span className="meta-label">Despatch Loc</span>
                <span className="meta-handwrite">{despatch.despatchLocation ?? ""}</span>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div>
              {/* Product — handwritten style */}
              <div className="meta-row">
                <span className="meta-label">Product</span>
                <span className="meta-handwrite">{despatch.productBrand ?? ""}</span>
              </div>
              {/* Grey Construction — full description from greyConstruction table */}
              <div className="meta-row">
                <span className="meta-label">Grey</span>
                <span className="meta-val" style={{ fontSize: '9pt' }}>{greyLabel}</span>
              </div>
              {/* Width — handwritten style (e.g. 61", 62", 65") */}
              <div className="meta-row">
                <span className="meta-label">Width</span>
                <span className="meta-handwrite">{widthLabel}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Vehicle</span>
                <span className="meta-val">{despatch.vehicleNo ?? ""}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">GP No</span>
                <span className="meta-val">{despatch.gpNo ?? ""}</span>
              </div>
            </div>

          </div>

          {/* ── Summary strip ── */}
          <div className="summary-strip">
            <div className="summary-item">
              <span className="summary-label">Than:</span>
              <span className="summary-val">{formatNum(totalThan)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total Meters:</span>
              <span className="summary-val">{formatNum(totalMeters)}</span>
            </div>
          </div>
          <div className="words-val">{words}</div>

          {/* ── 4-column grid of piece lengths ── */}
          <table className="grid">
            <thead>
              <tr>
                <th>S#</th><th>Mtrs</th>
                <th>S#</th><th>Mtrs</th>
                <th>S#</th><th>Mtrs</th>
                <th>S#</th><th>Mtrs</th>
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

              {/* Column sub-totals row */}
              {gridRows.length > 0 && (
                <tr className="grid-totals">
                  <td></td><td>{colTotals[0] > 0 ? formatNum(colTotals[0]) : ""}</td>
                  <td></td><td>{colTotals[1] > 0 ? formatNum(colTotals[1]) : ""}</td>
                  <td></td><td>{colTotals[2] > 0 ? formatNum(colTotals[2]) : ""}</td>
                  <td></td><td>{colTotals[3] > 0 ? formatNum(colTotals[3]) : ""}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── Grand Total row below table ── */}
          <div className="grand-total-row">
            <span>Than &nbsp;<span style={{ color: '#000' }}>{formatNum(totalThan)}</span></span>
            <span>Meters &nbsp;<span style={{ color: '#000' }}>{formatNum(totalMeters)}</span></span>
          </div>

          {/* ── Signatures ── */}
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
