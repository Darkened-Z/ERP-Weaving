import { requireSession } from "@/lib/auth";
import { DespatchDetailReport } from "@/components/despatch-detail-report";

export const dynamic = "force-dynamic";

export default async function GreyConvDespatchPage({ searchParams }: { searchParams: Promise<{ cont?: string }> }) {
  await requireSession();
  const contNo = ((await searchParams).cont ?? "").trim();
  return <DespatchDetailReport kind="conv" contNo={contNo} backHref="/external/reports/grey-conv-sale-avg" active="ext-r-gcsa" />;
}
