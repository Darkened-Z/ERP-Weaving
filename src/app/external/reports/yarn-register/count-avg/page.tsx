import { requireSession } from "@/lib/auth";
import { readFilters, loadRegister, filterText } from "../voucher-register";
import { RegisterReport } from "../register-report";

export const dynamic = "force-dynamic";

/**
 * Per count: the average rate and totals on the count's header row, and every
 * voucher behind them listed under it — party, bags, lbs, rate (owner
 * 2026-10-23, the Oracle Yarn Purchase Register).
 */
export default async function CountAvgPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSession();
  const f = readFilters(await searchParams);
  const { lines, partyLabel, countLabel } = await loadRegister(f);
  const title = f.type === "PUR" ? "YARN PURCHASE REGISTER" : f.type === "SAL" ? "YARN SALE REGISTER" : "YARN REGISTER";
  return (
    <RegisterReport
      title={`${title} — COUNT AVG`}
      lines={lines}
      groupBy="count"
      filter={filterText(f, partyLabel, countLabel)}
      filename="yarn-count-avg"
      avgHeader
    />
  );
}
