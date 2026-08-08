import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data.db");
const client = createClient({ url: `file:${dbPath}` });

async function run(sql) {
  try {
    await client.execute(sql);
    console.log("OK:", sql.substring(0, 80));
  } catch (e) {
    if (e.message?.includes("already exists") || e.message?.includes("duplicate")) {
      console.log("SKIP:", sql.substring(0, 80));
    } else {
      console.log("ERR:", e.message);
      throw e;
    }
  }
}

await run(`CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_no TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'P3_NORMAL',
  status TEXT NOT NULL DEFAULT 'OPEN',
  assignee_user_id INTEGER,
  reporter_user_id INTEGER NOT NULL,
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
)`);

await run(`CREATE TABLE IF NOT EXISTS ticket_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  author_user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
)`);

await run(`CREATE TABLE IF NOT EXISTS ticket_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  actor_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  created_at TEXT NOT NULL
)`);

await run("CREATE INDEX IF NOT EXISTS ix_tickets_status ON tickets(status)");
await run("CREATE INDEX IF NOT EXISTS ix_tickets_assignee ON tickets(assignee_user_id)");
await run("CREATE INDEX IF NOT EXISTS ix_tickets_reporter ON tickets(reporter_user_id)");
await run("CREATE INDEX IF NOT EXISTS ix_tickets_loom ON tickets(loom_no)");
await run("CREATE INDEX IF NOT EXISTS ix_tickets_type ON tickets(type)");
await run("CREATE INDEX IF NOT EXISTS ix_tickets_priority ON tickets(priority)");
await run("CREATE INDEX IF NOT EXISTS ix_ticket_comments_ticket ON ticket_comments(ticket_id)");
await run("CREATE INDEX IF NOT EXISTS ix_ticket_history_ticket ON ticket_history(ticket_id)");

const nowIso = new Date().toISOString();
const seedTickets = [
  { no: "TKT-0001", title: "Loom #14 belt slipping", type: "LOOM_BREAKDOWN", priority: "P1_URGENT", status: "IN_PROGRESS", loom: 14, desc: "Belt reported slipping under load. Weaver: Ahmad. Shift A." },
  { no: "TKT-0002", title: "Grade B jump on GC-003 batch", type: "QUALITY_DEFECT", priority: "P2_HIGH", status: "OPEN", loom: 27, desc: "Sudden grade B % increase on GC-003 last 2 days. Investigate weft tension." },
  { no: "TKT-0003", title: "Overpayment claim - Bashir Ahmed", type: "WEAVER_ISSUE", priority: "P3_NORMAL", status: "OPEN", loom: 3, desc: "Weaver disputes last week's payroll calculation." },
  { no: "TKT-0004", title: "AL NOOR TEXTILE - damaged rolls", type: "PARTY_COMPLAINT", priority: "P2_HIGH", status: "RESOLVED", loom: null, desc: "Party reported 3 damaged rolls on despatch DSP-2205. Replaced." },
  { no: "TKT-0005", title: "Quarterly maintenance - Shed B", type: "MAINTENANCE", priority: "P4_LOW", status: "OPEN", loom: null, desc: "Scheduled maintenance across all Shed B looms." },
  { no: "TKT-0006", title: "Air jet nozzle blockage - loom 33", type: "LOOM_BREAKDOWN", priority: "P2_HIGH", status: "BLOCKED", loom: 33, desc: "Blocked, waiting for replacement nozzle from supplier." },
];

for (const t of seedTickets) {
  const resolvedAt = t.status === "RESOLVED" ? nowIso : null;
  try {
    const result = await client.execute({
      sql: "INSERT INTO tickets (ticket_no, title, description, type, priority, status, reporter_user_id, loom_no, created_at, updated_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [t.no, t.title, t.desc, t.type, t.priority, t.status, 1, t.loom, nowIso, nowIso, resolvedAt]
    });
    const id = Number(result.lastInsertRowid);
    await client.execute({
      sql: "INSERT INTO ticket_history (ticket_id, actor_user_id, action, to_value, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, 1, "CREATED", t.status, nowIso]
    });
    console.log("SEEDED:", t.no);
  } catch (e) {
    if (e.message?.includes("UNIQUE")) {
      console.log("SKIP seed:", t.no);
    } else {
      console.log("ERR seed:", t.no, e.message);
    }
  }
}

console.log("\nTickets migration complete.");
client.close();
