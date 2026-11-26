import { db, schema } from "@/db";
import { and, desc, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { FINISHED, visibleTaskIds } from "@/lib/tasks";
import { outcome, score, type Score } from "@/lib/task-performance";
import { addDays, toKarachiDate, today } from "@/lib/time";

const pctChange = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : now ? 100 : 0);

type Trend = { value: number; change: number };
export type TaskDashboard = {
  asOf: string;
  month: { total: Trend; done: Trend; pending: Trend; people: Trend } | null;
  series: { date: string; done: number; created: number }[];
  team: ({ id: number; name: string; role: string } & Score)[];
  activity: { id: number; taskId: number; title: string; by: string; action: string; from: string | null; to: string | null; at: string }[];
  status: Record<string, number>;
};

/**
 * Task dashboard shared by the web Tasks page and the phone app.
 * `whole` = the whole mill (admins); otherwise only the user's visible tasks,
 * and the team list holds only the user.
 *  - month: this month vs last month (tasks due, completed, still open, people with tasks)
 *  - series: last 30 days, tasks completed / created per day
 *  - team: per assignee, the Task Report score for tasks due from 29 days ago to 7 days ahead
 *  - activity: latest task history
 *  - status: open tasks plus those finished this month (finished counted as DONE)
 */
export async function taskDashboard(userId: number, whole: boolean): Promise<TaskDashboard> {
  const asOf = today();
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const lastMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const from30 = addDays(asOf, -29);

  const mine = whole ? null : Array.from(await visibleTaskIds(userId));
  if (mine && !mine.length) return { asOf, month: null, series: [], team: [], activity: [], status: {} };

  const fromIso = new Date(Date.parse(`${lastMonthStart}T00:00:00+05:00`)).toISOString();
  const inScope = mine ? inArray(schema.tasks.id, mine) : undefined;
  const tasks = await db.select().from(schema.tasks).where(and(
    inScope,
    or(gte(schema.tasks.startDate, lastMonthStart), gte(schema.tasks.createdAt, fromIso), gte(schema.tasks.doneAt, fromIso)),
    or(isNull(schema.tasks.startDate), lte(schema.tasks.startDate, addDays(asOf, 60))),
  ));
  const open = await db.select({ status: schema.tasks.status, doneAt: schema.tasks.doneAt }).from(schema.tasks).where(inScope);
  const ids = tasks.map((t) => t.id);
  const [links, users, history] = await Promise.all([
    ids.length ? db.select().from(schema.taskUsers).where(inArray(schema.taskUsers.taskId, ids)) : [],
    db.select({ id: schema.users.id, name: schema.users.fullName, role: schema.users.roleName }).from(schema.users),
    db.select().from(schema.taskHistory).where(mine ? inArray(schema.taskHistory.taskId, mine) : undefined).orderBy(desc(schema.taskHistory.id)).limit(15),
  ]);
  const uname = new Map(users.map((u) => [u.id, u]));
  const doneOn = (t: (typeof tasks)[number]) => (t.doneAt ? toKarachiDate(new Date(t.doneAt)) : null);
  const createdOn = (t: (typeof tasks)[number]) => toKarachiDate(new Date(t.createdAt));

  const inMonth = (d: string | null, a: string, b: string) => !!d && d >= a && d < b;
  const nextMonth = `${addDays(`${asOf.slice(0, 7)}-28`, 5).slice(0, 7)}-01`;
  const month = (a: string, b: string) => {
    const due = tasks.filter((t) => inMonth(t.startDate ?? createdOn(t), a, b));
    const people = new Set(links.filter((l) => l.role === "ASSIGNEE" && due.some((t) => t.id === l.taskId)).map((l) => l.userId));
    return {
      total: due.length,
      done: tasks.filter((t) => inMonth(doneOn(t), a, b)).length,
      pending: due.filter((t) => !FINISHED.includes(t.status)).length,
      people: people.size,
    };
  };
  const cur = month(monthStart, nextMonth);
  const prev = month(lastMonthStart, monthStart);

  const series = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(from30, i);
    return { date: d, done: tasks.filter((t) => doneOn(t) === d).length, created: tasks.filter((t) => createdOn(t) === d).length };
  });

  const scored = tasks.filter((t) => t.startDate && t.startDate >= from30 && t.startDate <= addDays(asOf, 7));
  const byTask = new Map(scored.map((t) => [t.id, t]));
  const per = new Map<number, ReturnType<typeof outcome>[]>();
  for (const l of links) {
    if (l.role !== "ASSIGNEE" || !byTask.has(l.taskId)) continue;
    if (!whole && l.userId !== userId) continue;
    const t = byTask.get(l.taskId)!;
    (per.get(l.userId) ?? per.set(l.userId, []).get(l.userId)!).push(outcome(t.startDate, doneOn(t), asOf));
  }
  const team = [...per.entries()]
    .map(([id, items]) => ({ id, name: uname.get(id)?.name ?? `User ${id}`, role: uname.get(id)?.role ?? "", ...score(items) }))
    .sort((a, b) => (b.onTimePct ?? -1) - (a.onTimePct ?? -1) || b.total - a.total);

  const titles = new Map((await (history.length
    ? db.select({ id: schema.tasks.id, title: schema.tasks.title }).from(schema.tasks).where(inArray(schema.tasks.id, history.map((h) => h.taskId)))
    : Promise.resolve([]))).map((t) => [t.id, t.title]));
  const activity = history.map((h) => ({
    id: h.id, taskId: h.taskId, title: titles.get(h.taskId) ?? "", by: uname.get(h.actorUserId)?.name ?? "", action: h.action, from: h.fromValue, to: h.toValue, at: h.createdAt,
  }));

  const monthIso = new Date(Date.parse(`${monthStart}T00:00:00+05:00`)).toISOString();
  const status: Record<string, number> = {};
  for (const t of open) {
    if (FINISHED.includes(t.status) && !(t.doneAt && t.doneAt >= monthIso)) continue;
    const k = FINISHED.includes(t.status) ? "DONE" : t.status;
    status[k] = (status[k] ?? 0) + 1;
  }

  return {
    asOf,
    month: {
      total: { value: cur.total, change: pctChange(cur.total, prev.total) },
      done: { value: cur.done, change: pctChange(cur.done, prev.done) },
      pending: { value: cur.pending, change: pctChange(cur.pending, prev.pending) },
      people: { value: cur.people, change: pctChange(cur.people, prev.people) },
    },
    series, team, activity, status,
  };
}
