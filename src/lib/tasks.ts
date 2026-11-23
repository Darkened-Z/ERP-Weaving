import { db, schema } from "@/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { today, toKarachiDate } from "@/lib/time";
import { occurrences, parseMonthDates, parseWeekdays, type RepeatRule, type RepeatUnit } from "@/lib/task-schedule";

export const TASK_CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "PRODUCTION", label: "Production" },
  { value: "LOOM_BREAKDOWN", label: "Loom Breakdown" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "QUALITY_DEFECT", label: "Quality Defect" },
  { value: "WEAVER_ISSUE", label: "Weaver Issue" },
  { value: "PARTY_COMPLAINT", label: "Party Complaint" },
  { value: "ACCOUNTS", label: "Accounts" },
  { value: "PURCHASE", label: "Purchase" },
  { value: "OTHER", label: "Other" },
];

export const TASK_PRIORITIES = [
  { value: "URGENT", label: "Urgent", rank: 1 },
  { value: "HIGH", label: "High", rank: 2 },
  { value: "NORMAL", label: "Normal", rank: 3 },
  { value: "LOW", label: "Low", rank: 4 },
];

export const TASK_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
  { value: "CLOSED", label: "Closed" },
];

export const FINISHED = ["DONE", "CLOSED"];

const label = (list: { value: string; label: string }[], v: string | null | undefined) =>
  list.find((x) => x.value === v)?.label ?? v ?? "—";
export const categoryLabel = (v: string | null | undefined) => label(TASK_CATEGORIES, v);
export const priorityLabel = (v: string | null | undefined) => label(TASK_PRIORITIES, v);
export const statusLabel = (v: string | null | undefined) => label(TASK_STATUSES, v);
export const priorityRank = (v: string | null | undefined) => TASK_PRIORITIES.find((p) => p.value === v)?.rank ?? 5;

export function isOverdue(t: { status: string; startDate: string | null }, asOf = today()): boolean {
  return !!t.startDate && t.startDate < asOf && !FINISHED.includes(t.status);
}

let ready: Promise<void> | null = null;

/** Create the task tables on first use and carry the old tickets across once. */
export function ensureTaskTables(): Promise<void> {
  ready ??= (async () => {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_no TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'GENERAL',
        priority TEXT NOT NULL DEFAULT 'NORMAL',
        status TEXT NOT NULL DEFAULT 'OPEN',
        creator_user_id INTEGER NOT NULL REFERENCES users(id),
        start_date TEXT, start_time TEXT,
        repeat_rule TEXT NOT NULL DEFAULT 'NONE', repeat_every INTEGER, repeat_days TEXT, repeat_unit TEXT, repeat_dates TEXT, repeat_end TEXT,
        series_id INTEGER,
        shed TEXT, loom_no INTEGER, img TEXT, voice TEXT, legacy_ticket_id INTEGER,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, done_at TEXT)`,
      `CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks(status)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_tasks_series_start ON tasks(series_id, start_date)`,
      `CREATE TABLE IF NOT EXISTS task_users (
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_task_users ON task_users(task_id, user_id, role)`,
      `CREATE INDEX IF NOT EXISTS ix_task_users_user ON task_users(user_id)`,
      `CREATE TABLE IF NOT EXISTS task_checklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        srno INTEGER NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, done_by INTEGER, done_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS task_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        channel TEXT NOT NULL, amount INTEGER NOT NULL, unit TEXT NOT NULL, timing TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id),
        body TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS task_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        actor_user_id INTEGER NOT NULL REFERENCES users(id),
        action TEXT NOT NULL, from_value TEXT, to_value TEXT, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS task_repeat_skips (
        series_id INTEGER NOT NULL, start_date TEXT NOT NULL,
        PRIMARY KEY (series_id, start_date))`,
      `CREATE TABLE IF NOT EXISTS mobile_devices (
        push_token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS user_contacts (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        phone TEXT, email TEXT)`,
    ];
    for (const s of ddl) await db.run(sql.raw(s));
    await importTickets();
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const TICKET_STATUS: Record<string, string> = { RESOLVED: "DONE" };
const TICKET_PRIORITY: Record<string, string> = { P1_URGENT: "URGENT", P2_HIGH: "HIGH", P3_NORMAL: "NORMAL", P4_LOW: "LOW" };

async function importTickets() {
  const done = await db.select({ id: schema.tasks.legacyTicketId }).from(schema.tasks).where(isNotNull(schema.tasks.legacyTicketId));
  const seen = new Set(done.map((d) => d.id));
  const tickets = (await db.select().from(schema.tickets)).filter((t) => !seen.has(t.id));
  for (const t of tickets) {
    await db.transaction(async (tx) => {
      const taskNo = await nextTaskNo(tx);
      const [row] = await tx.insert(schema.tasks).values({
        taskNo,
        title: t.title,
        description: t.description,
        category: TASK_CATEGORIES.some((c) => c.value === t.type) ? t.type : "OTHER",
        priority: TICKET_PRIORITY[t.priority] ?? "NORMAL",
        status: TICKET_STATUS[t.status] ?? t.status,
        creatorUserId: t.reporterUserId,
        startDate: t.dueDate?.slice(0, 10) ?? null,
        shed: t.shed,
        loomNo: t.loomNo,
        img: t.img,
        legacyTicketId: t.id,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        doneAt: t.resolvedAt,
      }).returning({ id: schema.tasks.id });
      if (t.assigneeUserId) await tx.insert(schema.taskUsers).values({ taskId: row.id, userId: t.assigneeUserId, role: "ASSIGNEE" });
      const comments = await tx.select().from(schema.ticketComments).where(eq(schema.ticketComments.ticketId, t.id));
      if (comments.length) {
        await tx.insert(schema.taskComments).values(comments.map((c) => ({ taskId: row.id, authorUserId: c.authorUserId, body: c.body, createdAt: c.createdAt })));
      }
      await tx.insert(schema.taskHistory).values({ taskId: row.id, actorUserId: t.reporterUserId, action: "IMPORTED", fromValue: t.ticketNo, toValue: taskNo, createdAt: new Date().toISOString() });
    });
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function nextTaskNo(tx: Tx | typeof db): Promise<string> {
  const [{ maxNum }] = await tx
    .select({ maxNum: sql<number>`coalesce(max(CAST(SUBSTR(task_no, 5) AS INTEGER)), 0)` })
    .from(schema.tasks);
  return `TSK-${String(Number(maxNum) + 1).padStart(5, "0")}`;
}

/**
 * Create the repeat occurrences that have come due (start date <= today) and
 * do not exist yet. Each occurrence is its own task — users, checklist (fresh)
 * and reminders copied from the series' first task — so it can be done on its
 * own. The (series_id, start_date) unique index makes this safe to run on every
 * page load, even from two requests at once.
 */
export async function materializeRepeats(asOf = today()): Promise<number> {
  const roots = await db
    .select()
    .from(schema.tasks)
    .where(and(sql`${schema.tasks.repeatRule} <> 'NONE'`, sql`${schema.tasks.id} = ${schema.tasks.seriesId}`, isNotNull(schema.tasks.startDate)));
  let made = 0;
  for (const root of roots) {
    const dates = occurrences(root.startDate!, {
      rule: root.repeatRule as RepeatRule,
      every: root.repeatEvery,
      unit: root.repeatUnit as RepeatUnit | null,
      days: parseWeekdays(root.repeatDays),
      dates: parseMonthDates(root.repeatDates),
      end: root.repeatEnd,
    }, asOf);
    const have = new Set(
      (await db.select({ d: schema.tasks.startDate }).from(schema.tasks).where(eq(schema.tasks.seriesId, root.id))).map((r) => r.d),
    );
    // Copies start from the day the series was assigned — a back-dated start
    // must not flood the list with overdue copies from before it existed.
    const since = toKarachiDate(new Date(root.createdAt));
    // A copy someone deleted stays deleted.
    for (const s of await db.select({ d: schema.taskRepeatSkips.startDate }).from(schema.taskRepeatSkips).where(eq(schema.taskRepeatSkips.seriesId, root.id))) have.add(s.d);
    const missing = dates.filter((d) => d >= since && !have.has(d)).slice(-60);
    if (!missing.length) continue;
    const people = await db.select().from(schema.taskUsers).where(eq(schema.taskUsers.taskId, root.id));
    const items = await db.select().from(schema.taskChecklist).where(eq(schema.taskChecklist.taskId, root.id));
    const rems = await db.select().from(schema.taskReminders).where(eq(schema.taskReminders.taskId, root.id));
    for (const d of missing) {
      try {
        await db.transaction(async (tx) => {
          const now = new Date().toISOString();
          const [row] = await tx.insert(schema.tasks).values({
            taskNo: await nextTaskNo(tx),
            title: root.title, description: root.description, category: root.category, priority: root.priority,
            status: "OPEN", creatorUserId: root.creatorUserId, startDate: d, startTime: root.startTime,
            repeatRule: root.repeatRule, repeatEvery: root.repeatEvery, repeatDays: root.repeatDays, repeatUnit: root.repeatUnit, repeatDates: root.repeatDates, repeatEnd: root.repeatEnd,
            seriesId: root.id, shed: root.shed, loomNo: root.loomNo, createdAt: now, updatedAt: now,
          }).returning({ id: schema.tasks.id });
          if (people.length) await tx.insert(schema.taskUsers).values(people.map((p) => ({ taskId: row.id, userId: p.userId, role: p.role })));
          if (items.length) await tx.insert(schema.taskChecklist).values(items.map((i) => ({ taskId: row.id, srno: i.srno, text: i.text })));
          if (rems.length) await tx.insert(schema.taskReminders).values(rems.map((r) => ({ taskId: row.id, channel: r.channel, amount: r.amount, unit: r.unit, timing: r.timing })));
          await tx.insert(schema.taskHistory).values({ taskId: row.id, actorUserId: root.creatorUserId, action: "REPEATED", fromValue: root.taskNo, toValue: d, createdAt: now });
        });
        made++;
      } catch (e) {
        if (!String(e).includes("UNIQUE")) throw e;
      }
    }
  }
  return made;
}

let lastMaterialized = 0;

/** materializeRepeats at most every 10 minutes per server instance (phone list refreshes are frequent). */
export async function materializeRepeatsSometimes() {
  if (Date.now() - lastMaterialized < 10 * 60000) return;
  lastMaterialized = Date.now();
  await materializeRepeats();
}

export type TaskPeople = Map<number, { assignees: number[]; loop: number[] }>;

export async function peopleFor(taskIds: number[]): Promise<TaskPeople> {
  const out: TaskPeople = new Map();
  if (!taskIds.length) return out;
  const rows = await db.select().from(schema.taskUsers).where(inArray(schema.taskUsers.taskId, taskIds));
  for (const r of rows) {
    const p = out.get(r.taskId) ?? out.set(r.taskId, { assignees: [], loop: [] }).get(r.taskId)!;
    (r.role === "LOOP" ? p.loop : p.assignees).push(r.userId);
  }
  return out;
}

export async function contactsFor(userIds: number[]): Promise<Map<number, { phone: string | null; email: string | null }>> {
  if (!userIds.length) return new Map();
  await ensureTaskTables();
  const rows = await db.all<{ user_id: number; phone: string | null; email: string | null }>(
    sql`SELECT user_id, phone, email FROM user_contacts WHERE user_id IN (${sql.join(userIds.map((i) => sql`${i}`), sql`, `)})`,
  );
  return new Map(rows.map((r) => [Number(r.user_id), { phone: r.phone, email: r.email }]));
}

export function priorityClass(v: string): string {
  return v === "URGENT" ? "bg-[var(--danger)] text-white" : v === "HIGH" ? "border border-[var(--danger)] text-[var(--danger)]" : v === "LOW" ? "text-[var(--muted)]" : "border border-[var(--border)]";
}

/** Admins see and edit every task; everyone else only works on what is theirs. */
export const isTaskAdmin = (roleName: string | null | undefined) => ["ADMIN", "SUPERADMIN"].includes((roleName ?? "").toUpperCase());

/** Tasks a non-admin may see: assigned to them, in their loop, or created by them. */
export async function visibleTaskIds(userId: number): Promise<Set<number>> {
  const [links, created] = await Promise.all([
    db.select({ id: schema.taskUsers.taskId }).from(schema.taskUsers).where(eq(schema.taskUsers.userId, userId)),
    db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.creatorUserId, userId)),
  ]);
  return new Set([...links, ...created].map((r) => r.id));
}
