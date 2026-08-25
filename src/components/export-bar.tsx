"use client";

import { ExcelExportButton, type Column } from "./excel-export-button";
import { PdfExportButton } from "./pdf-export-button";

type Props = {
  rows: Record<string, unknown>[];
  columns: Column[];
  filename: string;
  sheetName?: string;
  title?: string;
  orientation?: "portrait" | "landscape";
};

/**
 * Renders Excel + PDF export buttons side by side with a row-count chip.
 * Drop-in replacement for the standalone ExcelExportButton.
 */
export function ExportBar({ rows, columns, filename, sheetName, title, orientation }: Props) {
  return (
    <div className="inline-flex items-center gap-2">
      <ExcelExportButton rows={rows} columns={columns} filename={filename} sheetName={sheetName} />
      <PdfExportButton
        rows={rows}
        columns={columns}
        filename={filename}
        title={title}
        orientation={orientation}
      />
    </div>
  );
}
