import { requireSession } from "@/lib/auth";
import { readFilters, loadRegister, filterText } from "../voucher-register";
import { RegisterReport } from "../register-report";

export const dynamic = "force-dynamic";

export default async function RegisterPartyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSession();
  const f = readFilters(await searchParams);
  const { lines, partyLabel, countLabel } = await loadRegister(f);
  const title = f.type === "PUR" ? "YARN PURCHASE REGISTER — PARTY" : f.type === "SAL" ? "YARN SALE REGISTER — PARTY" : "YARN REGISTER — PARTY";
  return (
    <RegisterReport
      title={title}
      lines={lines}
      groupBy="party"
      filter={filterText(f, partyLabel, countLabel)}
      filename="yarn-register-party"
    />
  );
}
