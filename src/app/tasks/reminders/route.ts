import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, inArray, notInArray, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { FINISHED, ensureTaskTables } from "@/lib/tasks";
import { reminderAt, type ReminderTiming, type ReminderUnit } from "@/lib/task-schedule";

export const dynamic = "force-dynamic";

/** Karachi wall clock "YYYY-MM-DDTHH:MM" (PKT = UTC+5, no DST). */
const pkt = (ms: number) => new Date(ms + 5 * 3600000).toISOString().slice(0, 16);

/**
 * Reminders of the signed-in user's open tasks (assigned to them, or assigned
 * by them) that fire between 12 hours ago and 24 hours ahead. The browser
 * decides when one is due and shows it once.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ reminders: [] }, { status: 401 });
  await ensureTaskTables();

  const mine = await db.select({ id: schema.taskUsers.taskId }).from(schema.taskUsers)
    .where(and(eq(schema.taskUsers.userId, session.userId), eq(schema.taskUsers.role, "ASSIGNEE")));
  const created = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.creatorUserId, session.userId));
  const ids = Array.from(new Set([...mine, ...created].map((r) => r.id)));
  if (!ids.length) return NextResponse.json({ now: pkt(Date.now()), reminders: [] });

  const tasks = await db.select({
    id: schema.tasks.id, taskNo: schema.tasks.taskNo, title: schema.tasks.title,
    startDate: schema.tasks.startDate, startTime: schema.tasks.startTime,
  }).from(schema.tasks).where(and(inArray(schema.tasks.id, ids), notInArray(schema.tasks.status, FINISHED), isNotNull(schema.tasks.startDate)));
  if (!tasks.length) return NextResponse.json({ now: pkt(Date.now()), reminders: [] });
  const rems = await db.select().from(schema.taskReminders).where(inArray(schema.taskReminders.taskId, tasks.map((t) => t.id)));

  const from = pkt(Date.now() - 12 * 3600000);
  const to = pkt(Date.now() + 24 * 3600000);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const reminders = rems
    .map((r) => {
      const t = byId.get(r.taskId)!;
      return {
        key: `${r.id}@${t.startDate}${t.startTime ?? ""}`,
        taskId: t.id,
        taskNo: t.taskNo,
        title: t.title,
        channel: r.channel,
        at: reminderAt(t.startDate!, t.startTime, r.amount, r.unit as ReminderUnit, r.timing as ReminderTiming),
        start: `${t.startDate}${t.startTime ? ` ${t.startTime}` : ""}`,
      };
    })
    .filter((r) => r.at >= from && r.at <= to)
    .sort((a, b) => a.at.localeCompare(b.at));
  return NextResponse.json({ now: pkt(Date.now()), reminders });
}
