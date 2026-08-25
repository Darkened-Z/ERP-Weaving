"use client";

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type Column = {
  key: string;
  label: string;
};

type Props = {
  rows: Record<string, unknown>[];
  columns: Column[];
  filename: string;
  sheetName?: string;
  title?: string;
};

export function ExcelExportButton({ rows, columns, filename, sheetName, title }: Props) {
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const exportExcel = () => {
    const data = rows.map((r) =>
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
      body: rows.map((r) =>
        columns.map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined) return "";
          return typeof v === "object" ? JSON.stringify(v) : String(v);
        })
      ),
      styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 246, 250] },
      margin: { top: 24, left: 8, right: 8, bottom: 12 },
    });
    doc.save(`${filename}-${stamp()}.pdf`);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" onClick={exportExcel} className="btn btn-outline btn-sm">
        Export Excel
      </button>
      <button type="button" onClick={exportPdf} className="btn btn-outline btn-sm">
        Export PDF
      </button>
      <span className="text-[11px] text-[var(--muted)] mono">{rows.length} rows</span>
    </div>
  );
}
