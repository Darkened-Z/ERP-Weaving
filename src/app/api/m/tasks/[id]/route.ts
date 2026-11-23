import { db, schema } from "@/db";
import { asc, desc, eq } from "drizzle-orm";
import { isResponse, json, mobileSession } from "@/lib/mobile-api";
import { isTaskAdmin, visibleTaskIds } from "@/lib/tasks";
import { addTaskComment, canActOnTask, setTaskStatus, toggleChecklistItem } from "@/lib/task-actions";
import { reminderLabel } from "@/lib/task-schedule";
import type { Session } from "@/lib/session-token";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, ctx: Ctx): Promise<{ s: Session; taskId: number } | Response> {
  const s = await mobileSession(req);
  if (isResponse(s)) return s;
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return json({ error: "Not found" }, 404);
  const taskId = parseInt(id, 10);
  const [t] = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!t || (!isTaskAdmin(s.roleName) && !(await visibleTaskIds(s.userId)).has(taskId))) return json({ error: "Not found" }, 404);
  return { s, taskId };
}

export async function GET(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r instanceof Response) return r;
  const { s, taskId } = r;
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  const [users, links, items, comments, history, rems] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users),
    db.select().from(schema.taskUsers).where(eq(schema.taskUsers.taskId, taskId)),
    db.select().from(schema.taskChecklist).where(eq(schema.taskChecklist.taskId, taskId)).orderBy(asc(schema.taskChecklist.srno)),
    db.select().from(schema.taskComments).where(eq(schema.taskComments.taskId, taskId)).orderBy(asc(schema.taskComments.createdAt)),
    db.select().from(schema.taskHistory).where(eq(schema.taskHistory.taskId, taskId)).orderBy(desc(schema.taskHistory.id)).limit(30),
    db.select().from(schema.taskReminders).where(eq(schema.taskReminders.taskId, taskId)),
  ]);
  const uname = new Map(users.map((u) => [u.id, u.name]));
  return json({
    task: {
      id: task.id, taskNo: task.taskNo, title: task.title, description: task.description, priority: task.priority, category: task.category,
      status: task.status, startDate: task.startDate, startTime: task.startTime, doneAt: task.doneAt,
      shed: task.shed, loomNo: task.loomNo, createdBy: uname.get(task.creatorUserId) ?? "",
      repeats: task.repeatRule !== "NONE",
    },
    assignees: links.filter((l) => l.role === "ASSIGNEE").map((l) => uname.get(l.userId) ?? ""),
    loop: links.filter((l) => l.role === "LOOP").map((l) => uname.get(l.userId) ?? ""),
    checklist: items.map((i) => ({ id: i.id, text: i.text, done: !!i.done, doneBy: i.doneBy ? uname.get(i.doneBy) ?? "" : null })),
    comments: comments.map((c) => ({ id: c.id, by: uname.get(c.authorUserId) ?? "", body: c.body, at: c.createdAt })),
    history: history.map((h) => ({ id: h.id, by: uname.get(h.actorUserId) ?? "", action: h.action, from: h.fromValue, to: h.toValue, at: h.createdAt })),
    reminders: rems.map((x) => reminderLabel(x.amount, x.unit, x.timing)),
    mayAct: await canActOnTask(taskId, s),
  });
}

/** { action: "status", to } | { action: "check", itemId } | { action: "comment", body } */
export async function POST(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r instanceof Response) return r;
  const { s, taskId } = r;
  const b = (await req.json().catch(() => null)) as { action?: string; to?: string; itemId?: number; body?: string } | null;
  const result =
    b?.action === "status" ? await setTaskStatus(taskId, s, String(b.to ?? ""))
    : b?.action === "check" ? await toggleChecklistItem(taskId, s, Number(b.itemId))
    : b?.action === "comment" ? await addTaskComment(taskId, s, String(b.body ?? ""))
    : "invalid";
  if (result === "forbidden") return json({ error: "Only the people assigned, the person who assigned it, or an admin can change this task." }, 403);
  if (result === "invalid") return json({ error: "Nothing to change" }, 400);
  return json({ ok: true });
}
