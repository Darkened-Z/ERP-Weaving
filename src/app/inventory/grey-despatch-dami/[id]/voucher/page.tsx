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

export default async function DamiVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const damiId = Number(id);
  if (!Number.isFinite(damiId)) notFound();

  const [dami] = await db
    .select()
    .from(schema.intGreyDespatchDami)
    .where(eq(schema.intGreyDespatchDami.id, damiId))
    .limit(1);

  if (!dami) notFound();

  const lines = await db
    .select()
    .from(schema.intGreyDespatchDamiLine)
    .where(eq(schema.intGreyDespatchDamiLine.damiId, damiId))
    .orderBy(schema.intGreyDespatchDamiLine.srNo);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const totalMtrs = dami.mtrs ?? lines.reduce((s, l) => s + (l.mtrs ?? 0), 0);
  const totalThan = dami.than ?? lines.reduce((s, l) => s + (l.than ?? 0), 0);

  // Expand lines into individual piece entries (each than = one row)
  const pieces: { sNo: number; mtrs: number }[] = [];
  let sNo = 1;
  for (const line of lines) {
    const count = line.than ?? 1;
    const mtrEach = line.mtrs != null ? line.mtrs / count : 0;
    for (let i = 0; i < count; i++) {
      pieces.push({ sNo: sNo++, mtrs: mtrEach });
    }
  }

  // 4-column grid
  const colLength = Math.max(1, Math.ceil(pieces.length / 4));
  const gridRows: { sNo: number | null; mtrs: number | null }[][] = [];
  for (let r = 0; r < colLength; r++) {
    const row: { sNo: number | null; mtrs: number | null }[] = [];
    for (let c = 0; c < 4; c++) {
      const idx = c * colLength + r;
      row.push(idx < pieces.length ? pieces[idx] : { sNo: null, mtrs: null });
    }
    gridRows.push(row);
  }

  const colTotals = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < colLength; r++) {
      const idx = c * colLength + r;
      if (idx < pieces.length) colTotals[c] += pieces[idx].mtrs;
    }
  }

  let words = numberToWords(totalMtrs, "");
  if (words.startsWith(" ")) words = words.slice(1);
  if (words) words = "(" + words.charAt(0).toUpperCase() + words.slice(1) + " Meters)";

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 8mm 12mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .chalan-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
          .chalan-wrap { padding: 0 !important; background: #fff !important; }
        }
        .chalan-wrap { background: var(--bg); min-height: 100vh; padding: 24px 12px; }
        .chalan-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .chalan-page { background: #fff; color: #000; max-width: 210mm; margin: 0 auto; padding: 10mm 10mm; border: 1px solid var(--border); font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.4; }
        .title-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
        .doc-title { font-size: 20pt; font-weight: 700; color: #222; }
        .logo-qr-block { display: flex; align-items: center; gap: 10px; }
        .meta-section { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin-bottom: 12px; }
        .meta-row { display: flex; align-items: baseline; border-bottom: 1px solid #ddd; padding: 3px 0; margin-bottom: 2px; }
        .meta-label { font-size: 9pt; color: #555; width: 105px; flex-shrink: 0; }
        .meta-val { font-weight: 700; font-size: 10pt; text-transform: uppercase; flex: 1; word-break: break-word; }
        .summary-strip { display: flex; gap: 24px; justify-content: flex-end; margin-bottom: 6px; font-size: 10pt; }
        .summary-item { display: flex; gap: 6px; align-items: baseline; }
        .summary-label { color: #555; }
        .summary-val { font-weight: 700; font-size: 12pt; }
        .words-val { font-size: 8.5pt; font-style: italic; text-align: right; margin-bottom: 8px; color: #444; }
        table.grid { width: 100%; border-collapse: collapse; border: 1px solid #aaa; margin-top: 6px; }
        table.grid th, table.grid td { border: 1px solid #bbb; padding: 3px 6px; font-size: 9.5pt; }
        table.grid th { background: #e8eef6; color: #1e3a8a; font-weight: 700; text-align: center; }
        table.grid th:nth-child(even) { text-align: right; }
        table.grid td:nth-child(odd) { text-align: center; color: #555; width: 40px; }
        table.grid td:nth-child(even) { text-align: right; font-weight: 600; }
        .grid-totals td { background: #dce8f8; font-weight: 700 !important; border-top: 2px solid #aaa; }
        .grand-total-row { margin-top: 8px; display: flex; justify-content: flex-end; gap: 32px; font-size: 11pt; font-weight: 700; border-top: 2px solid #333; padding-top: 6px; }
        .grand-total-row span { color: #1e3a8a; }
        .signatures { margin-top: 48px; display: flex; justify-content: space-between; padding: 0 20px; }
        .sig-box { text-align: center; }
        .sig-line { width: 130px; border-top: 1px solid #000; margin-bottom: 6px; }
        .sig-label { font-size: 9pt; color: #555; }
      `}</style>

      <div className="chalan-wrap">
        <div className="chalan-toolbar no-print">
          <Link href="/inventory/grey-despatch-dami" className="btn btn-outline btn-sm">Back</Link>
          <PrintButton label="Print Delivery Voucher" />
        </div>

        <div className="chalan-page">
          {/* Title + Logo */}
          <div className="title-row">
            <div className="doc-title">Delivery Voucher</div>
            <div className="logo-qr-block">
              <div style={{ textAlign: "center", fontSize: "7.5pt", color: "#555" }}>
                <QrImage value="https://wa.me/923232201515" size={54} />
                <div style={{ marginTop: "2px", fontWeight: "bold" }}>WhatsApp Us</div>
              </div>
              <img src="/sk-logo.png" alt="SK Textile" style={{ height: "60px", objectFit: "contain" }} />
            </div>
          </div>

          {/* Meta info */}
          <div className="meta-section">
            <div>
              <div className="meta-row"><span className="meta-label">Book #</span><span className="meta-val">{dami.vNo}</span></div>
              <div className="meta-row"><span className="meta-label">Date</span><span className="meta-val">{dami.vDate}</span></div>
              <div className="meta-row"><span className="meta-label">Party</span><span className="meta-val" style={{ borderBottom: "1px solid #000", flex: 1 }}>{dami.subParty ?? dami.party ?? ""}</span></div>
              <div className="meta-row"><span className="meta-label">Despatch Loc</span><span className="meta-val" style={{ borderBottom: "1px solid #000", flex: 1 }}>{dami.printingLocation ?? ""}</span></div>
              <div className="meta-row"><span className="meta-label">Cont #</span><span className="meta-val">{dami.contNo ?? ""}</span></div>
            </div>
            <div>
              <div className="meta-row"><span className="meta-label">Product</span><span className="meta-val" style={{ borderBottom: "1px solid #000", flex: 1 }}>{dami.productDesc ?? ""}</span></div>
              <div className="meta-row"><span className="meta-label">Grey</span><span className="meta-val" style={{ fontSize: "9pt" }}>{dami.dspQualityDesc ?? dami.dspQuality ?? ""}</span></div>
              <div className="meta-row"><span className="meta-label">Width</span><span className="meta-val" style={{ borderBottom: "1px solid #000", flex: 1 }}>{dami.width ? `${dami.width}"` : ""}</span></div>
              <div className="meta-row"><span className="meta-label">Term</span><span className="meta-val">{dami.term ?? ""}</span></div>
              <div className="meta-row"><span className="meta-label">Broker</span><span className="meta-val">{dami.brokerName ?? ""}</span></div>
            </div>
          </div>

          {/* Summary */}
          <div className="summary-strip">
            <div className="summary-item"><span className="summary-label">Than:</span><span className="summary-val">{formatNum(totalThan)}</span></div>
            <div className="summary-item"><span className="summary-label">Meters Tot:</span><span className="summary-val">{formatNum(totalMtrs)}</span></div>
          </div>
          <div className="words-val">{words}</div>

          {/* 4-column grid */}
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
              {gridRows.length > 0 ? gridRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <React.Fragment key={cIdx}>
                      <td>{cell.sNo ?? ""}</td>
                      <td>{cell.mtrs != null ? formatNum(cell.mtrs) : ""}</td>
                    </React.Fragment>
                  ))}
                </tr>
              )) : (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "20px" }}>No piece entries recorded.</td></tr>
              )}
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

          {/* Grand total */}
          <div className="grand-total-row">
            <span>Than &nbsp;<span style={{ color: "#000" }}>{formatNum(totalThan)}</span></span>
            <span>Meters &nbsp;<span style={{ color: "#000" }}>{formatNum(totalMtrs)}</span></span>
          </div>

          {/* Signatures */}
          <div className="signatures">
            <div className="sig-box"><div className="sig-line" /><div className="sig-label">Prepared By</div></div>
            <div className="sig-box"><div className="sig-line" /><div className="sig-label">Checked By</div></div>
            <div className="sig-box"><div className="sig-line" /><div className="sig-label">Approved By</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
