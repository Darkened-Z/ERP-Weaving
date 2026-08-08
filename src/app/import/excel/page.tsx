import { Shell } from "@/components/shell";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default function ExcelImportPage() {
  return (
    <Shell active="excel-import">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Excel Import</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            Upload a spreadsheet, map columns, preview rows. Actual writes land in v2.
          </p>
        </div>
        <ImportForm />
      </div>
    </Shell>
  );
}
