import { CountsAccountsReport } from "@/app/reports/weaving/count-report/report";

export const dynamic = "force-dynamic";

// The same figures the mill already reads, sitting where they belong: with the
// other grey reports under Inventory External. Seed here is yarn SOLD to the
// party, which is what makes this the Sale side.
export default async function WeavingCountsSalePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string }>;
}) {
  return (
    <CountsAccountsReport
      searchParams={searchParams}
      title="Weaving Counts Accounts Report — Sale"
      navKey="ext-r-weaving-sale"
      partyScope="grey-sale-contract"
    />
  );
}
