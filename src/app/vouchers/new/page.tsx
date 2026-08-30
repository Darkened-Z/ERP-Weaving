import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import NewVoucherForm from "./voucher-form";

export const dynamic = "force-dynamic";

export default async function NewVoucherPage() {
  const accounts = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.code);

  return <NewVoucherForm accounts={accounts} />;
}
