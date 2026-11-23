import Link from "next/link";
import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { addDays, today } from "@/lib/time";
import {
  FINISHED,
  categoryLabel,
  ensureTaskTables,
  materializeRepeats,
  priorityClass,
  priorityLabel,
  priorityRank,
  statusLabel,
} from "@/lib/tasks";

export const dynamic = "force-dynamic";

type Row = typeof schema.tasks.$inferSelect;

export default async function MyTasksPage() {
  const session = await requireSession();
  await ensureTaskTables();
  await materializeRepeats();

  async function markDone(formData: FormData) {
    "use server";
    const s = await requireSession();
    const id = parseInt(String(formData.get("id") ?? ""), 10);
    const [mine] = await db.select().from(schema.taskUsers)
      .where(and(eq(schema.taskUsers.taskId, id), eq(schema.taskUsers.userId, s.userId), eq(schema.taskUsers.role, "ASSIGNEE")));
    if (!mine) return;
    const [cur] = await db.select({ status: schema.tasks.status }).from(schema.tasks).where(eq(schema.tasks.id, id));
    if (!cur || FINISHED.includes(cur.status)) return;
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.update(schema.tasks).set({ status: "DONE", doneAt: now, updatedAt: now }).where(eq(schema.tasks.id, id));
      await tx.insert(schema.taskHistory).values({ taskId: id, actorUserId: s.userId, action: "STATUS", fromValue: cur.status, toValue: "DONE", createdAt: now });
    });
    revalidatePath("/my-tasks");
  }

  const links = await db.select().from(schema.taskUsers).where(eq(schema.taskUsers.userId, session.userId));
  const assignedIds = links.filter((l) => l.role === "ASSIGNEE").map((l) => l.taskId);
  const loopIds = links.filter((l) => l.role === "LOOP").map((l) => l.taskId);
  const ids = Array.from(new Set([...assignedIds, ...loopIds]));
  const tasks = ids.length ? await db.select().from(schema.tasks).where(inArray(schema.tasks.id, ids)) : [];
  const checklist = ids.length ? await db.select({ taskId: schema.taskChecklist.taskId, done: schema.taskChecklist.done }).from(schema.taskChecklist).where(inArray(schema.taskChecklist.taskId, ids)) : [];

  const asOf = today();
  const weekAgo = addDays(asOf, -7);
  const order = (a: Row, b: Row) =>
    (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || (a.startTime ?? "").localeCompare(b.startTime ?? "") || priorityRank(a.priority) - priorityRank(b.priority);
  const open = tasks.filter((t) => assignedIds.includes(t.id) && !FINISHED.includes(t.status)).sort(order);
  const groups = [
    { title: "Overdue", rows: open.filter((t) => t.startDate && t.startDate < asOf), danger: true },
    { title: "Today", rows: open.filter((t) => t.startDate === asOf) },
    { title: "Upcoming", rows: open.filter((t) => t.startDate && t.startDate > asOf) },
    { title: "No date", rows: open.filter((t) => !t.startDate) },
    { title: "In loop", rows: tasks.filter((t) => loopIds.includes(t.id) && !FINISHED.includes(t.status)).sort(order), watch: true },
  ];
  const doneWeek = tasks.filter((t) => assignedIds.includes(t.id) && t.doneAt && t.doneAt.slice(0, 10) >= weekAgo).length;

  return (
    <Shell active="my-tasks">
      <div className="animate-in max-w-[760px]">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h1 className="page-title">My Tasks</h1>
          <div className="flex gap-2">
            <Link prefetch={false} href="/tasks/report" className="btn btn-outline btn-sm">My report</Link>
            <Link prefetch={false} href="/tasks/new" className="btn btn-sm">+ Assign Task</Link>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-px bg-black border border-black mb-5">
          {[
            { l: "Overdue", n: groups[0].rows.length },
            { l: "Today", n: groups[1].rows.length },
            { l: "Open", n: open.length },
            { l: "Done 7d", n: doneWeek },
          ].map((s) => (
            <div key={s.l} className="bg-white p-3">
              <div className={`mono text-xl font-bold ${s.l === "Overdue" && s.n ? "text-[var(--danger)]" : ""}`}>{s.n}</div>
              <div className="stat-label">{s.l}</div>
            </div>
          ))}
        </div>

        {open.length === 0 && groups[4].rows.length === 0 && (
          <div className="border border-[var(--border)] p-8 text-center text-[13px] text-[var(--muted)]">Nothing on your list.</div>
        )}

        {groups.filter((g) => g.rows.length).map((g) => (
          <div key={g.title} className="mb-5">
            <div className={`label mb-1 ${g.danger ? "!text-[var(--danger)]" : ""}`}>{g.title} ({g.rows.length})</div>
            <div className="border border-black bg-white divide-y divide-[var(--border-light)]">
              {g.rows.map((t) => {
                const items = checklist.filter((c) => c.taskId === t.id);
                const ticked = items.filter((c) => c.done).length;
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-3">
                    {!g.watch && (
                      <form action={markDone}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="w-6 h-6 border-2 border-black hover:bg-[var(--success)]" title="Mark done" aria-label={`Mark ${t.taskNo} done`} />
                      </form>
                    )}
                    <Link prefetch={false} href={`/tasks/${t.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 font-semibold ${priorityClass(t.priority)}`}>{priorityLabel(t.priority)}</span>
                        <span className="text-[11px] text-[var(--muted)]">{categoryLabel(t.category)}</span>
                        {items.length > 0 && <span className="mono text-[11px]">{ticked}/{items.length}</span>}
                      </div>
                      <div className="font-semibold text-[14px] truncate">{t.title}</div>
                      <div className="text-[12px] text-[var(--muted)]">
                        {t.startDate ? `${t.startDate.slice(8, 10)}/${t.startDate.slice(5, 7)}${t.startTime ? ` ${t.startTime}` : ""}` : "No date"} · {statusLabel(t.status)} · {t.taskNo}
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
