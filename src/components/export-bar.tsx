"use client";

import { ExcelExportButton, type Column } from "./excel-export-button";

type Props = {
  rows: Record<string, unknown>[];
  columns: Column[];
  filename: string;
  sheetName?: string;
  title?: string;
  /** Kept for callers; the PDF picks its orientation from the column count. */
  orientation?: "portrait" | "landscape";
};

/**
 * Excel + PDF export buttons with a row-count chip. ExcelExportButton already
 * renders the PDF button, so adding PdfExportButton here showed it twice.
 */
export function ExportBar({ rows, columns, filename, sheetName, title }: Props) {
  return <ExcelExportButton rows={rows} columns={columns} filename={filename} sheetName={sheetName} title={title} />;
}
