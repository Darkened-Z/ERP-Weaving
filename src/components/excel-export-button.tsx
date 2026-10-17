"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { captureCanvas, shareBlob } from "@/components/wa-pdf-button";

export type Column = {
  key: string;
  label: string;
};

const cellText = (v: unknown) =>
  v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

const FONT = "Helvetica, Arial, sans-serif";
const PAD = 6;
const LINE = 15;
const MAX_COL = 240;
// iOS Safari refuses canvases over ~16.7M pixels or 16k px a side; a long
// list is drawn at a smaller scale instead of failing to share.
const MAX_AREA = 16_000_000;
const MAX_SIDE = 16_000;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const word of para.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width <= width || !cur) cur = next;
      else {
        lines.push(cur);
        cur = word;
      }
    }
    lines.push(cur);
  }
  return lines;
}

/** The same table the PDF export prints, drawn as one image for WhatsApp. */
function drawTable(heading: string, columns: Column[], rows: Record<string, unknown>[], totals?: Record<string, unknown>) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  const body = rows.map((r) => columns.map((c) => cellText(r[c.key])));
  const numeric = columns.map((c) => rows.length > 0 && rows.every((r) => r[c.key] == null || typeof r[c.key] === "number"));

  ctx.font = `bold 12px ${FONT}`;
  const widths = columns.map((c) => Math.min(MAX_COL, ctx.measureText(c.label).width));
  ctx.font = `12px ${FONT}`;
  const foot = totals ? columns.map((c) => cellText(totals[c.key])) : null;
  [...body, ...(foot ? [foot] : [])].forEach((cells) => cells.forEach((t, i) => (widths[i] = Math.min(MAX_COL, Math.max(widths[i], ctx.measureText(t).width)))));

  ctx.font = `bold 12px ${FONT}`;
  const head = columns.map((c, i) => wrap(ctx, c.label, widths[i]));
  ctx.font = `12px ${FONT}`;
  const lines = body.map((cells) => cells.map((t, i) => wrap(ctx, t, widths[i])));
  ctx.font = `bold 12px ${FONT}`;
  const footLines = foot ? foot.map((t, i) => wrap(ctx, t, widths[i])) : null;

  const margin = 16;
  const tableW = widths.reduce((s, w) => s + w + PAD * 2, 0);
  const rowH = (cells: string[][]) => Math.max(1, ...cells.map((l) => l.length)) * LINE + PAD;
  const headH = rowH(head);
  const heights = lines.map(rowH);
  const footH = footLines ? rowH(footLines) : 0;
  const top = margin + 44;
  const W = tableW + margin * 2;
  const H = top + headH + heights.reduce((s, h) => s + h, 0) + footH + margin;
  const scale = Math.min(2, Math.sqrt(MAX_AREA / (W * H)), MAX_SIDE / W, MAX_SIDE / H);

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(W * scale);
  canvas.height = Math.ceil(H * scale);
  const g = canvas.getContext("2d")!;
  g.scale(scale, scale);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.textBaseline = "top";

  g.fillStyle = "#000000";
  g.font = `bold 18px ${FONT}`;
  g.fillText(heading, margin, margin);
  g.font = `11px ${FONT}`;
  g.fillStyle = "#555555";
  g.fillText(`Generated ${new Date().toLocaleString()} — ${rows.length} rows`, margin, margin + 24);

  const drawRow = (cells: string[][], y: number, h: number, fill: string | null, bold: boolean, color: string, alignNumbers = !bold) => {
    if (fill) {
      g.fillStyle = fill;
      g.fillRect(margin, y, tableW, h);
    }
    g.font = `${bold ? "bold " : ""}12px ${FONT}`;
    g.fillStyle = color;
    let x = margin;
    cells.forEach((l, i) => {
      const w = widths[i] + PAD * 2;
      l.forEach((t, j) => {
        const tx = numeric[i] && alignNumbers ? x + w - PAD - g.measureText(t).width : x + PAD;
        g.fillText(t, tx, y + PAD / 2 + 1 + j * LINE);
      });
      x += w;
    });
    g.strokeStyle = "#d0d4dc";
    g.lineWidth = 0.5;
    g.strokeRect(margin, y, tableW, h);
  };

  drawRow(head, top, headH, "#1e293b", true, "#ffffff");
  let y = top + headH;
  lines.forEach((cells, i) => {
    drawRow(cells, y, heights[i], i % 2 ? "#f4f6fa" : null, false, "#000000");
    y += heights[i];
  });
  if (footLines) {
    drawRow(footLines, y, footH, "#e2e5ea", true, "#000000", true);
    g.strokeStyle = "#000000";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(margin, y);
    g.lineTo(margin + tableW, y);
    g.stroke();
    y += footH;
  }
  let x = margin;
  g.strokeStyle = "#d0d4dc";
  for (const w of widths.slice(0, -1)) {
    x += w + PAD * 2;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, y);
    g.stroke();
  }
  return canvas;
}

type Props = {
  rows: Record<string, unknown>[];
  columns: Column[];
  filename: string;
  sheetName?: string;
  title?: string;
  /** When a record is open, WA shares that element (its sheet) instead of the list. */
  waTarget?: { contentId: string; filename: string };
  /** A TOTAL row, keyed like a row; printed last in Excel, PDF and the WA image. */
  totals?: Record<string, unknown>;
};

export function ExcelExportButton({ rows, columns, filename, sheetName, title, waTarget, totals }: Props) {
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const exportExcel = () => {
    const data = [...rows, ...(totals ? [totals] : [])].map((r) =>
      Object.fromEntries(columns.map((c) => [c.label, r[c.key]]))
    );
    const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName ?? "Sheet1");
    XLSX.writeFile(wb, `${filename}-${stamp()}.xlsx`);
  };

  const exportPdf = () => {
    const wide = columns.length > 6;
    const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "mm", format: "a4" });
    const heading = title ?? filename;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(heading, 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated ${new Date().toLocaleString()} — ${rows.length} rows`, 14, 20);
    autoTable(doc, {
      startY: 24,
      head: [columns.map((c) => c.label)],
      body: rows.map((r) => columns.map((c) => cellText(r[c.key]))),
      ...(totals ? { foot: [columns.map((c) => cellText(totals[c.key]))], footStyles: { fillColor: [226, 229, 234], textColor: 0, fontStyle: "bold" as const }, showFoot: "lastPage" as const } : {}),
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 246, 250] },
      margin: { top: 24, left: 8, right: 8, bottom: 12 },
    });
    doc.save(`${filename}-${stamp()}.pdf`);
  };

  const [busy, setBusy] = useState(false);
  const shareJpg = async () => {
    setBusy(true);
    try {
      const canvas = waTarget ? await captureCanvas(waTarget.contentId) : drawTable(title ?? filename, columns, rows, totals);
      if (!canvas) return;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      if (blob) await shareBlob(blob, waTarget ? waTarget.filename : `${filename}-${stamp()}.jpg`, "image/jpeg");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={exportExcel} className="btn btn-outline btn-sm">
        Export Excel
      </button>
      <button type="button" onClick={exportPdf} className="btn btn-outline btn-sm">
        Export PDF
      </button>
      <button type="button" onClick={shareJpg} disabled={busy} className="btn btn-sm" style={{ background: "#25D366", color: "#fff", border: "none", fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
        {busy ? "..." : "WA"}
      </button>
      <span className="text-[11px] text-[var(--muted)] mono">{rows.length} rows</span>
    </div>
  );
}
