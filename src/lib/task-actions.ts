import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { FINISHED, TASK_STATUSES, isTaskAdmin, statusLabel } from "@/lib/tasks";
import { pushToUsers } from "@/lib/task-push";

/**
 * Task changes shared by the web pages and the phone app, so both write the
 * same history and send the same pushes.
 */

type Actor = { userId: number; fullName: string; roleName: string };

/** Assignees, the creator and admins act on a task; people in the loop only watch and comment. */
export async function canActOnTask(taskId: number, actor: Actor) {
  if (isTaskAdmin(actor.roleName)) return true;
  const [t] = await db.select({ c: schema.tasks.creatorUserId }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!t) return false;
  if (t.c === actor.userId) return true;
  const [a] = await db.select().from(schema.taskUsers).where(and(eq(schema.taskUsers.taskId, taskId), eq(schema.taskUsers.userId, actor.userId), eq(schema.taskUsers.role, "ASSIGNEE")));
  return !!a;
}

/** Everyone on a task: creator, assignees and (optionally) the loop. */
async function audience(taskId: number, withLoop: boolean) {
  const [t] = await db.select({ creator: schema.tasks.creatorUserId, taskNo: schema.tasks.taskNo, title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!t) return null;
  const links = await db.select().from(schema.taskUsers).where(eq(schema.taskUsers.taskId, taskId));
  const users = [t.creator, ...links.filter((l) => withLoop || l.role === "ASSIGNEE").map((l) => l.userId)];
  return { ...t, users };
}

/** "ok" | "invalid" | "forbidden" | "same" */
export async function setTaskStatus(taskId: number, actor: Actor, to: string) {
  if (!TASK_STATUSES.some((x) => x.value === to)) return "invalid";
  if (!(await canActOnTask(taskId, actor))) return "forbidden";
  const [cur] = await db.select({ status: schema.tasks.status }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!cur) return "invalid";
  if (cur.status === to) return "same";
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.update(schema.tasks).set({ status: to, updatedAt: now, doneAt: FINISHED.includes(to) ? now : null }).where(eq(schema.tasks.id, taskId));
    await tx.insert(schema.taskHistory).values({ taskId, actorUserId: actor.userId, action: "STATUS", fromValue: cur.status, toValue: to, createdAt: now });
  });
  const a = await audience(taskId, false);
  if (a) pushToUsers(a.users.filter((u) => u !== actor.userId), { title: `${a.taskNo} · ${statusLabel(to)}`, body: `${actor.fullName}: ${a.title}`, taskId });
  return "ok";
}

export async function toggleChecklistItem(taskId: number, actor: Actor, itemId: number) {
  if (!(await canActOnTask(taskId, actor))) return "forbidden";
  const [it] = await db.select().from(schema.taskChecklist).where(and(eq(schema.taskChecklist.id, itemId), eq(schema.taskChecklist.taskId, taskId)));
  if (!it) return "invalid";
  const now = new Date().toISOString();
  await db.update(schema.taskChecklist).set(it.done ? { done: 0, doneBy: null, doneAt: null } : { done: 1, doneBy: actor.userId, doneAt: now }).where(eq(schema.taskChecklist.id, itemId));
  await db.insert(schema.taskHistory).values({ taskId, actorUserId: actor.userId, action: it.done ? "UNCHECKED" : "CHECKED", toValue: it.text, createdAt: now });
  return "ok";
}

export async function addTaskComment(taskId: number, actor: Actor, body: string) {
  const text = body.trim().slice(0, 4000);
  if (!text) return "invalid";
  await db.insert(schema.taskComments).values({ taskId, authorUserId: actor.userId, body: text, createdAt: new Date().toISOString() });
  const a = await audience(taskId, true);
  if (a) pushToUsers(a.users.filter((u) => u !== actor.userId), { title: `${a.taskNo} · comment`, body: `${actor.fullName}: ${text.slice(0, 140)}`, taskId });
  return "ok";
}

/** Tell the people on a new task. */
export async function announceNewTask(taskId: number, actor: Actor) {
  const a = await audience(taskId, true);
  if (a) pushToUsers(a.users.filter((u) => u !== actor.userId), { title: `New task ${a.taskNo}`, body: `${a.title} — from ${actor.fullName}`, taskId });
}
