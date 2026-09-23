import { AgingDetailReport } from "../aging-detail/report";

export const dynamic = "force-dynamic";

export default async function DebtorsAgingDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; party?: string }>;
}) {
  return (
    <AgingDetailReport
      searchParams={searchParams}
      side="DB"
      title="Debtors Accounts Aging"
      navKey="fin-aging-db-detail"
    />
  );
}
