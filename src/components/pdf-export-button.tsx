"use client";

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
  title?: string;
  orientation?: "portrait" | "landscape";
};

export function PdfExportButton({ rows, columns, filename, title, orientation }: Props) {
  const handleExport = () => {
    const wide = columns.length > 6;
    const doc = new jsPDF({
      orientation: orientation ?? (wide ? "landscape" : "portrait"),
      unit: "mm",
      format: "a4",
    });

    if (title) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(title, 14, 14);
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const now = new Date();
    const stamp = `Generated ${now.toLocaleString()} — ${rows.length} rows`;
    doc.text(stamp, 14, title ? 20 : 14);

    autoTable(doc, {
      startY: title ? 24 : 18,
      head: [columns.map((c) => c.label)],
      body: rows.map((r) =>
        columns.map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined) return "";
          return typeof v === "object" ? JSON.stringify(v) : String(v);
        })
      ),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 246, 250] },
      margin: { top: title ? 24 : 18, left: 8, right: 8, bottom: 12 },
    });

    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    doc.save(`${filename}-${date}.pdf`);
  };

  return (
    <button type="button" onClick={handleExport} className="btn btn-outline btn-sm">
      Export PDF
    </button>
  );
}
