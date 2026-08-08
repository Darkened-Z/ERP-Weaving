"use client";

import * as XLSX from "xlsx";

export type Column = {
  key: string;
  label: string;
};

type Props = {
  rows: Record<string, unknown>[];
  columns: Column[];
  filename: string;
  sheetName?: string;
};

export function ExcelExportButton({ rows, columns, filename, sheetName }: Props) {
  const handleExport = () => {
    const data = rows.map((r) =>
      Object.fromEntries(columns.map((c) => [c.label, r[c.key]]))
    );
    const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName ?? "Sheet1");
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `${filename}-${date}.xlsx`);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" onClick={handleExport} className="btn btn-outline btn-sm">
        Export Excel
      </button>
      <span className="text-[11px] text-[var(--muted)] mono">{rows.length} rows</span>
    </div>
  );
}
