import { CountsAccountsPartyWiseReport } from "./report";

export const dynamic = "force-dynamic";

export default async function CountsAccountsPpPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
}) {
  return <CountsAccountsPartyWiseReport searchParams={searchParams} />;
}
