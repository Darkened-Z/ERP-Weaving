import { CountsAccountsReport } from "@/app/reports/weaving/count-report/report";

export const dynamic = "force-dynamic";

// The purchase side: the parties named on an EXTERNAL grey conversion contract
// of type CONV. Everything else is the sale report exactly as it stands — same
// columns, same seed, same ledger and bags links.
export default async function WeavingCountsPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string }>;
}) {
  return (
    <CountsAccountsReport
      searchParams={searchParams}
      title="Weaving Counts Accounts Report — Purchase"
      navKey="ext-r-weaving-purchase"
      partyScope="grey-conv-contract"
    />
  );
}
