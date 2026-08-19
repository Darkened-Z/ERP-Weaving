import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data.db");
const client = createClient({ url: `file:${dbPath}` });

let ok = 0, skip = 0, err = 0;
async function run(sql) {
  try {
    await client.execute(sql);
    console.log("OK:", sql.substring(0, 70));
    ok++;
  } catch (e) {
    if (e.message?.includes("duplicate column")) { console.log("SKIP:", sql.substring(0, 70)); skip++; }
    else { console.log("ERR:", e.message); err++; }
  }
}

await run("ALTER TABLE trans_main ADD COLUMN vtime TEXT");
await run("ALTER TABLE trans_main ADD COLUMN due_date TEXT");
await run("ALTER TABLE trans_main ADD COLUMN exp_date TEXT");
await run("ALTER TABLE trans_main ADD COLUMN trn_type TEXT");
await run("ALTER TABLE trans_main ADD COLUMN img TEXT");
await run("ALTER TABLE trans_main ADD COLUMN splitting TEXT");
await run("ALTER TABLE trans_main ADD COLUMN balance_amount REAL");
await run("ALTER TABLE trans_detail ADD COLUMN yarn_count TEXT");
await run("ALTER TABLE trans_detail ADD COLUMN cont_no TEXT");

console.log(`\nFinance migration: ${ok} OK, ${skip} skipped, ${err} errors.`);
client.close();
