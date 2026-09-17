import { CountsAccountsReport } from "./report";

export const dynamic = "force-dynamic";

export default async function WeavingCountReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; count?: string }>;
}) {
  return <CountsAccountsReport searchParams={searchParams} />;
}
