import { AgingDetailReport } from "../aging-detail/report";

export const dynamic = "force-dynamic";

export default async function CreditorsAgingDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; party?: string }>;
}) {
  return (
    <AgingDetailReport
      searchParams={searchParams}
      side="CR"
      title="Creditors Accounts Aging"
      navKey="fin-aging-cr-detail"
    />
  );
}
