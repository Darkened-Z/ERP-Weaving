import { CountsAccountsPartyWiseReport } from "@/app/reports/weaving/counts-accounts-pp/report";

export const dynamic = "force-dynamic";

export default async function WeavingCountsPartyWisePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
}) {
  return (
    <CountsAccountsPartyWiseReport
      searchParams={searchParams}
      navKey="ext-r-weaving-pp"
    />
  );
}
