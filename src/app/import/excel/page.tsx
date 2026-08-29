import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Excel Import was a non-functional preview (mapped rows were never written to
// the DB). Gated off so nobody mistakes it for a working importer and loses
// data. Re-enable by restoring the ImportForm render + nav link once the
// server-side import is actually built.
export default function ExcelImportPage() {
  redirect("/");
}
