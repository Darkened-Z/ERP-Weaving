import { db, schema } from "@/db";
import { and, gte, inArray, notInArray, or } from "drizzle-orm";
import { isResponse, json, mobileSession } from "@/lib/mobile-api";
import { FINISHED, TASK_CATEGORIES, TASK_PRIORITIES, isTaskAdmin, materializeRepeatsSometimes, nextTaskNo, visibleTaskIds } from "@/lib/tasks";
import { announceNewTask } from "@/lib/task-actions";
import { reminderAt, type ReminderTiming, type ReminderUnit } from "@/lib/task-schedule";
import { today } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Karachi wall clock "YYYY-MM-DDTHH:MM" (PKT = UTC+5, no DST). */
const pkt = (ms: number) => new Date(ms + 5 * 3600000).toISOString().slice(0, 16);

/**
 * The phone's task list: open tasks plus those finished in the last 7 days.
 * Admins get every task with ?all=1, otherwise their own (assigned, in the
 * loop, or created). Reminders of the next 7 days come along so the phone can
 * schedule them itself and ring on time without the network.
 */
export async function GET(req: Request) {
  const s = await mobileSession(req);
  if (isResponse(s)) return s;
  await materializeRepeatsSometimes();
  const admin = isTaskAdmin(s.roleName);
  const all = admin && new URL(req.url).searchParams.get("all") === "1";
  const recent = new Date(Date.now() - 7 * 86400000).toISOString();

  const mineIds = all ? null : Array.from(await visibleTaskIds(s.userId));
  if (mineIds && !mineIds.length) return json({ asOf: today(), tasks: [], reminders: [] });
  const live = or(notInArray(schema.tasks.status, FINISHED), gte(schema.tasks.doneAt, recent));
  const tasks = await db.select().from(schema.tasks).where(mineIds ? and(inArray(schema.tasks.id, mineIds), live) : live);
  const ids = tasks.map((t) => t.id);
  if (!ids.length) return json({ asOf: today(), tasks: [], reminders: [] });

  const [links, items, rems, users] = await Promise.all([
    db.select().from(schema.taskUsers).where(inArray(schema.taskUsers.taskId, ids)),
    db.select({ taskId: schema.taskChecklist.taskId, done: schema.taskChecklist.done }).from(schema.taskChecklist).where(inArray(schema.taskChecklist.taskId, ids)),
    db.select().from(schema.taskReminders).where(inArray(schema.taskReminders.taskId, ids)),
    db.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users),
  ]);
  const uname = new Map(users.map((u) => [u.id, u.name]));

  const out = tasks.map((t) => {
    const mine = links.filter((l) => l.taskId === t.id);
    const myRole = mine.some((l) => l.userId === s.userId && l.role === "ASSIGNEE") ? "ASSIGNEE"
      : t.creatorUserId === s.userId ? "CREATOR"
      : mine.some((l) => l.userId === s.userId) ? "LOOP" : null;
    const its = items.filter((i) => i.taskId === t.id);
    return {
      id: t.id, taskNo: t.taskNo, title: t.title, priority: t.priority, category: t.category, status: t.status,
      startDate: t.startDate, startTime: t.startTime, doneAt: t.doneAt, myRole,
      assignees: mine.filter((l) => l.role === "ASSIGNEE").map((l) => uname.get(l.userId) ?? ""),
      createdBy: uname.get(t.creatorUserId) ?? "",
      checklist: { done: its.filter((i) => i.done).length, total: its.length },
    };
  });

  // Ring only for the user's own work (assigned to them or by them), as the web does.
  const from = pkt(Date.now() - 12 * 3600000), to = pkt(Date.now() + 7 * 86400000);
  const ringFor = new Set(out.filter((t) => (t.myRole === "ASSIGNEE" || t.myRole === "CREATOR") && !FINISHED.includes(t.status) && t.startDate).map((t) => t.id));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const reminders = rems
    .filter((r) => ringFor.has(r.taskId))
    .map((r) => {
      const t = byId.get(r.taskId)!;
      return { key: `${r.id}@${t.startDate}${t.startTime ?? ""}`, taskId: t.id, taskNo: t.taskNo, title: t.title, at: reminderAt(t.startDate!, t.startTime, r.amount, r.unit as ReminderUnit, r.timing as ReminderTiming) };
    })
    .filter((r) => r.at >= from && r.at <= to);

  return json({ asOf: today(), tasks: out, reminders });
}

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Admins assign a task from the phone. Repeats stay on the web form. */
export async function POST(req: Request) {
  const s = await mobileSession(req);
  if (isResponse(s)) return s;
  if (!isTaskAdmin(s.roleName)) return json({ error: "Only an admin can assign tasks" }, 403);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = String(b?.title ?? "").trim().slice(0, 300);
  if (!title) return json({ error: "Title is required" }, 400);

  const active = new Set((await db.select({ id: schema.users.id, status: schema.users.status, role: schema.users.roleName }).from(schema.users))
    .filter((u) => u.status === "A" && u.role !== "superadmin").map((u) => u.id));
  const ids = (v: unknown) => Array.from(new Set((Array.isArray(v) ? v : []).map(Number))).filter((n) => active.has(n));
  const assignees = ids(b?.assignees);
  if (!assignees.length) return json({ error: "Pick at least one user" }, 400);
  const loop = ids(b?.loop).filter((n) => !assignees.includes(n));
  const checklist = (Array.isArray(b?.checklist) ? b.checklist : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 50);
  const startDate = isIso(b?.startDate) ? b.startDate : null;
  const startTime = typeof b?.startTime === "string" && /^\d{2}:\d{2}$/.test(b.startTime) ? b.startTime : null;
  const remindBefore = Number(b?.remindMinutesBefore);
  const now = new Date().toISOString();

  const taskId = await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.tasks).values({
      taskNo: await nextTaskNo(tx),
      title,
      description: String(b?.description ?? "").trim().slice(0, 4000) || null,
      category: TASK_CATEGORIES.some((c) => c.value === b?.category) ? String(b!.category) : "GENERAL",
      priority: TASK_PRIORITIES.some((p) => p.value === b?.priority) ? String(b!.priority) : "NORMAL",
      status: "OPEN", creatorUserId: s.userId, startDate, startTime, createdAt: now, updatedAt: now,
    }).returning({ id: schema.tasks.id });
    await tx.insert(schema.taskUsers).values([
      ...assignees.map((userId) => ({ taskId: row.id, userId, role: "ASSIGNEE" })),
      ...loop.map((userId) => ({ taskId: row.id, userId, role: "LOOP" })),
    ]);
    if (checklist.length) await tx.insert(schema.taskChecklist).values(checklist.map((text, i) => ({ taskId: row.id, srno: i + 1, text })));
    if (startDate && b?.remindMinutesBefore != null && Number.isFinite(remindBefore) && remindBefore >= 0 && remindBefore <= 7 * 1440) {
      await tx.insert(schema.taskReminders).values({ taskId: row.id, channel: "APP", amount: Math.floor(remindBefore), unit: "minutes", timing: "BEFORE" });
    }
    await tx.insert(schema.taskHistory).values({ taskId: row.id, actorUserId: s.userId, action: "CREATED", toValue: "OPEN", createdAt: now });
    return row.id;
  });
  await announceNewTask(taskId, s);
  return json({ id: taskId });
}
