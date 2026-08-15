import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data.db");
const client = createClient({ url: `file:${dbPath}` });

const tables = [
  {
    table: "tickets",
    orphanChecks: [
      {
        label: "tickets.reporter_user_id",
        sql: "SELECT count(*) AS c FROM tickets WHERE reporter_user_id NOT IN (SELECT id FROM users)",
      },
    ],
    create: `CREATE TABLE tickets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'P3_NORMAL',
  status TEXT NOT NULL DEFAULT 'OPEN',
  assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id),
  loom_no INTEGER,
  contract_no TEXT,
  party_code TEXT,
  grey_code TEXT,
  beam_no TEXT,
  labels TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_tickets_status ON tickets(status)",
      "CREATE INDEX IF NOT EXISTS ix_tickets_assignee ON tickets(assignee_user_id)",
      "CREATE INDEX IF NOT EXISTS ix_tickets_reporter ON tickets(reporter_user_id)",
      "CREATE INDEX IF NOT EXISTS ix_tickets_loom ON tickets(loom_no)",
      "CREATE INDEX IF NOT EXISTS ix_tickets_type ON tickets(type)",
      "CREATE INDEX IF NOT EXISTS ix_tickets_priority ON tickets(priority)",
    ],
  },
  {
    table: "ticket_comments",
    orphanChecks: [
      {
        label: "ticket_comments.author_user_id",
        sql: "SELECT count(*) AS c FROM ticket_comments WHERE author_user_id NOT IN (SELECT id FROM users)",
      },
    ],
    create: `CREATE TABLE ticket_comments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ticket_comments_ticket ON ticket_comments(ticket_id)",
    ],
  },
  {
    table: "ticket_history",
    orphanChecks: [
      {
        label: "ticket_history.actor_user_id",
        sql: "SELECT count(*) AS c FROM ticket_history WHERE actor_user_id NOT IN (SELECT id FROM users)",
      },
    ],
    create: `CREATE TABLE ticket_history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  created_at TEXT NOT NULL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ticket_history_ticket ON ticket_history(ticket_id)",
    ],
  },
];

await client.execute("PRAGMA foreign_keys=OFF");

const cleaned = await client.execute(
  "UPDATE tickets SET assignee_user_id = NULL WHERE assignee_user_id IS NOT NULL AND assignee_user_id NOT IN (SELECT id FROM users)"
);
console.log(`ORPHANS tickets.assignee_user_id: ${cleaned.rowsAffected} set to NULL`);

let rebuilt = 0;
let errors = 0;

for (const t of tables) {
  try {
    let abort = false;
    for (const check of t.orphanChecks) {
      const res = await client.execute(check.sql);
      const c = Number(res.rows[0]?.c ?? 0);
      if (c > 0) {
        console.log(`ABORT ${t.table}: ${check.label} has ${c} orphan rows`);
        abort = true;
      } else {
        console.log(`ORPHANS ${check.label}: 0`);
      }
    }
    if (abort) {
      errors++;
      continue;
    }

    await client.batch(
      [
        t.create,
        `INSERT INTO ${t.table}_new SELECT * FROM ${t.table}`,
        `DROP TABLE ${t.table}`,
        `ALTER TABLE ${t.table}_new RENAME TO ${t.table}`,
      ],
      "write"
    );
    for (const ix of t.indexes) {
      await client.execute(ix);
    }
    rebuilt++;
    console.log(`REBUILT ${t.table}: user FKs enforced`);
  } catch (e) {
    errors++;
    console.log(`ERR ${t.table}: ${e.message}`);
  }
}

const drops = [
  "DROP INDEX IF EXISTS idx_trans_main_key",
  "DROP INDEX IF EXISTS idx_trans_detail_acc",
  "DROP INDEX IF EXISTS idx_trans_detail_key",
  "DROP TABLE IF EXISTS int_yarn_contract_delivery",
  "DROP TABLE IF EXISTS int_yarn_contract",
];

for (const d of drops) {
  try {
    await client.execute(d);
    console.log(`OK: ${d}`);
  } catch (e) {
    errors++;
    console.log(`ERR: ${d} -> ${e.message}`);
  }
}

await client.execute("PRAGMA foreign_keys=ON");
const check = await client.execute("PRAGMA foreign_key_check");
if (check.rows.length === 0) {
  console.log("\nforeign_key_check: clean (0 violations)");
} else {
  console.log(`\nforeign_key_check: ${check.rows.length} VIOLATIONS`);
  for (const row of check.rows) console.log(JSON.stringify(row));
}

console.log(`\nUser FK migration: ${rebuilt}/${tables.length} tables rebuilt, ${errors} errors.`);
client.close();
