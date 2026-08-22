import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

await client.execute(`
  CREATE TABLE IF NOT EXISTS quick_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party TEXT NOT NULL,
    grey_quality TEXT,
    quantity REAL,
    rate REAL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_by TEXT,
    created_at TEXT NOT NULL
  )
`);
await client.execute(`CREATE INDEX IF NOT EXISTS ix_quick_contract_status ON quick_contracts(status)`);
await client.execute(`CREATE INDEX IF NOT EXISTS ix_quick_contract_created ON quick_contracts(created_at)`);

const { rows } = await client.execute("SELECT COUNT(*) n FROM quick_contracts");
console.log(`quick_contracts ready (rows: ${rows[0].n})`);
client.close();
