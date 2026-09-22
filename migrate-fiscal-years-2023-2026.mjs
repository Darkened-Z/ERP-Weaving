import { createClient } from "@libsql/client";
import path from "node:path";

/**
 * Add the financial years 2023 through 2026.
 *
 * The mill's year runs July to June and the chart already holds 2019 to 2022
 * on that pattern, but the data does not stop at June 2023 — the investor
 * ledgers run to September 2026 and vouchers are being written today. Anything
 * dated past the last defined year has no year to belong to, which is why 489
 * investor entries could not be posted and why a voucher entered now is stamped
 * with 2022 whatever date it carries.
 *
 * Existing years keep their status. The new ones follow the same convention:
 * closed behind, active on the one we are in.
 *
 * Idempotent — a year that is already there is left exactly as it is.
 */

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const years = [2023, 2024, 2025, 2026].map((y) => ({
  code: String(y),
  description: `July ${y} - June ${y + 1}`,
  start: `${y}-07-01`,
  end: `${y + 1}-06-30`,
}));

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

for (const y of years) {
  const found = await client.execute({
    sql: "SELECT code FROM fiscal_years WHERE code = ?",
    args: [y.code],
  });
  if (found.rows.length) {
    console.log(`  = ${y.code} already exists`);
    continue;
  }
  // Closed once it is behind us, active for the year we are actually in.
  const status = today > y.end ? "C" : "A";
  await client.execute({
    sql: `INSERT INTO fiscal_years (code, description, start_date, end_date, status)
          VALUES (?, ?, ?, ?, ?)`,
    args: [y.code, y.description, y.start, y.end, status],
  });
  console.log(`  + ${y.code}  ${y.start} -> ${y.end}  (${status})`);
}

const all = await client.execute("SELECT code, start_date, end_date, status FROM fiscal_years ORDER BY start_date");
console.log("\nfiscal years now:");
for (const r of all.rows) console.log(`  ${r.code}  ${r.start_date} -> ${r.end_date}  ${r.status}`);

const [profile] = (await client.execute("SELECT current_fy FROM company_profile LIMIT 1")).rows;
const current = all.rows.find((r) => today >= String(r.start_date) && today <= String(r.end_date));
console.log(`\ncompany current_fy is ${profile?.current_fy}; today (${today}) falls in ${current?.code ?? "none"}`);
if (current && String(profile?.current_fy) !== String(current.code)) {
  console.log("  ! the company's current year has NOT been changed — that is an owner decision,");
  console.log("    and moving it re-stamps which year new vouchers are written into.");
}
process.exit(0);
