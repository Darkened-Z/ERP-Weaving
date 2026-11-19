import Link from "next/link";
import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseImages } from "@/lib/attachments";
import {
  FINISHED,
  TASK_STATUSES,
  categoryLabel,
  contactsFor,
  ensureTaskTables,
  isOverdue,
  peopleFor,
  priorityClass,
  priorityLabel,
  statusLabel,
  isTaskAdmin,
  visibleTaskIds,
} from "@/lib/tasks";
import { REMINDER_CHANNELS, parseMonthDates, parseWeekdays, reminderAt, reminderLabel, repeatLabel, type ReminderTiming, type ReminderUnit, type RepeatRule, type RepeatUnit } from "@/lib/task-schedule";

export const dynamic = "force-dynamic";

const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Assignees, the creator and admins act on a task; people in the loop only watch and comment. */
async function canAct(taskId: number, userId: number, roleName: string) {
  if (isTaskAdmin(roleName)) return true;
  const [t] = await db.select({ c: schema.tasks.creatorUserId }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!t) return false;
  if (t.c === userId) return true;
  const [a] = await db.select().from(schema.taskUsers).where(and(eq(schema.taskUsers.taskId, taskId), eq(schema.taskUsers.userId, userId), eq(schema.taskUsers.role, "ASSIGNEE")));
  return !!a;
}

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const taskId = parseInt(id, 10);
  const session = await requireSession();
  await ensureTaskTables();

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!task) notFound();
  if (!isTaskAdmin(session.roleName) && !(await visibleTaskIds(session.userId)).has(taskId)) notFound();

  async function setStatus(formData: FormData) {
    "use server";
    const s = await requireSession();
    const to = String(formData.get("to") ?? "");
    if (!TASK_STATUSES.some((x) => x.value === to)) return;
    if (!(await canAct(taskId, s.userId, s.roleName))) redirect(`/tasks/${taskId}?error=not_yours`);
    const [cur] = await db.select({ status: schema.tasks.status }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!cur || cur.status === to) return;
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.update(schema.tasks).set({ status: to, updatedAt: now, doneAt: FINISHED.includes(to) ? now : null }).where(eq(schema.tasks.id, taskId));
      await tx.insert(schema.taskHistory).values({ taskId, actorUserId: s.userId, action: "STATUS", fromValue: cur.status, toValue: to, createdAt: now });
    });
    revalidatePath(`/tasks/${taskId}`);
  }

  async function toggleItem(formData: FormData) {
    "use server";
    const s = await requireSession();
    if (!(await canAct(taskId, s.userId, s.roleName))) redirect(`/tasks/${taskId}?error=not_yours`);
    const itemId = parseInt(String(formData.get("item") ?? ""), 10);
    const [it] = await db.select().from(schema.taskChecklist).where(and(eq(schema.taskChecklist.id, itemId), eq(schema.taskChecklist.taskId, taskId)));
    if (!it) return;
    const now = new Date().toISOString();
    await db.update(schema.taskChecklist).set(it.done ? { done: 0, doneBy: null, doneAt: null } : { done: 1, doneBy: s.userId, doneAt: now }).where(eq(schema.taskChecklist.id, itemId));
    await db.insert(schema.taskHistory).values({ taskId, actorUserId: s.userId, action: it.done ? "UNCHECKED" : "CHECKED", toValue: it.text, createdAt: now });
    revalidatePath(`/tasks/${taskId}`);
  }

  async function addComment(formData: FormData) {
    "use server";
    const s = await requireSession();
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;
    await db.insert(schema.taskComments).values({ taskId, authorUserId: s.userId, body: body.slice(0, 4000), createdAt: new Date().toISOString() });
    revalidatePath(`/tasks/${taskId}`);
  }

  async function deleteTask() {
    "use server";
    const s = await requireSession();
    const [t] = await db.select({ c: schema.tasks.creatorUserId }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!t) redirect("/tasks");
    if (!isTaskAdmin(s.roleName)) redirect(`/tasks/${taskId}?error=not_yours`);
    await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    revalidatePath("/tasks");
    redirect("/tasks");
  }

  const users = await db.select({ id: schema.users.id, fullName: schema.users.fullName }).from(schema.users);
  const uname = new Map(users.map((u) => [u.id, u.fullName]));
  const people = (await peopleFor([taskId])).get(taskId) ?? { assignees: [], loop: [] };
  const items = await db.select().from(schema.taskChecklist).where(eq(schema.taskChecklist.taskId, taskId)).orderBy(asc(schema.taskChecklist.srno));
  const reminders = await db.select().from(schema.taskReminders).where(eq(schema.taskReminders.taskId, taskId));
  const comments = await db.select().from(schema.taskComments).where(eq(schema.taskComments.taskId, taskId)).orderBy(asc(schema.taskComments.createdAt));
  const history = await db.select().from(schema.taskHistory).where(eq(schema.taskHistory.taskId, taskId)).orderBy(asc(schema.taskHistory.id));
  const contacts = await contactsFor(people.assignees);
  const [series] = task.seriesId && task.seriesId !== task.id
    ? await db.select({ id: schema.tasks.id, taskNo: schema.tasks.taskNo }).from(schema.tasks).where(eq(schema.tasks.id, task.seriesId))
    : [];
  const mayAct = await canAct(taskId, session.userId, session.roleName);
  const mayEdit = isTaskAdmin(session.roleName);
  const images = parseImages(task.img);
  const doneCount = items.filter((i) => i.done).length;
  const rep = repeatLabel({ rule: task.repeatRule as RepeatRule, every: task.repeatEvery, unit: task.repeatUnit as RepeatUnit | null, days: parseWeekdays(task.repeatDays), dates: parseMonthDates(task.repeatDates), end: task.repeatEnd });
  const msg = `Task ${task.taskNo}: ${task.title}${task.startDate ? ` — ${dmy(task.startDate)}${task.startTime ? ` ${task.startTime}` : ""}` : ""}`;

  const next: { to: string; label: string; primary?: boolean }[] =
    task.status === "OPEN" ? [{ to: "IN_PROGRESS", label: "Start" }, { to: "DONE", label: "Mark Done", primary: true }, { to: "BLOCKED", label: "Blocked" }]
    : task.status === "IN_PROGRESS" ? [{ to: "DONE", label: "Mark Done", primary: true }, { to: "BLOCKED", label: "Blocked" }]
    : task.status === "BLOCKED" ? [{ to: "IN_PROGRESS", label: "Resume", primary: true }, { to: "CLOSED", label: "Close" }]
    : task.status === "DONE" ? [{ to: "CLOSED", label: "Close", primary: true }, { to: "OPEN", label: "Reopen" }]
    : [{ to: "OPEN", label: "Reopen" }];

  return (
    <Shell active="tickets">
      <div className="animate-in max-w-[860px]">
        <div className="mb-3"><Link href="/tasks" className="text-[13px] underline">← Tasks</Link></div>
        {sp.error === "not_yours" && <div className="border-2 border-[var(--danger)] px-3 py-2 mb-3 text-[12px] text-[var(--danger)]">Only the people assigned, the person who assigned it, or an admin can change this task.</div>}

        <div className="border border-black bg-white p-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="mono text-[12px] text-[var(--muted)]">{task.taskNo}</span>
            <span className={`text-[10px] px-1.5 py-0.5 font-semibold ${priorityClass(task.priority)}`}>{priorityLabel(task.priority)}</span>
            <span className="text-[12px] text-[var(--muted)]">{categoryLabel(task.category)}</span>
            {rep && <span className="text-[10px] border border-[var(--border)] px-1.5">{rep}{task.repeatEnd ? ` until ${dmy(task.repeatEnd)}` : ""}</span>}
            <span className="ml-auto text-[12px] font-bold">{statusLabel(task.status)}</span>
          </div>
          <h1 className="text-[20px] font-bold leading-tight">{task.title}</h1>
          {task.description && <p className="text-[14px] mt-2 whitespace-pre-wrap">{task.description}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-4 text-[13px]">
            <div><span className="text-[var(--muted)]">Start:</span> <span className={isOverdue(task) ? "text-[var(--danger)] font-bold" : ""}>{dmy(task.startDate)}{task.startTime ? ` ${task.startTime}` : ""}{isOverdue(task) ? " · overdue" : ""}</span></div>
            <div><span className="text-[var(--muted)]">Assigned by:</span> {uname.get(task.creatorUserId) ?? "—"}</div>
            <div><span className="text-[var(--muted)]">Users:</span> {people.assignees.map((i) => uname.get(i)).join(", ") || "Unassigned"}</div>
            <div><span className="text-[var(--muted)]">In loop:</span> {people.loop.map((i) => uname.get(i)).join(", ") || "—"}</div>
            {task.loomNo != null && <div><span className="text-[var(--muted)]">Loom:</span> Shed {task.shed} · Loom {task.loomNo}</div>}
            {series && <div><span className="text-[var(--muted)]">Series:</span> <Link href={`/tasks/${series.id}`} className="underline mono">{series.taskNo}</Link></div>}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {mayAct && next.map((n) => (
              <form key={n.to} action={setStatus}>
                <input type="hidden" name="to" value={n.to} />
                <button className={`btn btn-sm ${n.primary ? "" : "btn-outline"}`} style={n.primary && n.to === "DONE" ? { background: "var(--success)", borderColor: "var(--success)" } : undefined}>{n.label}</button>
              </form>
            ))}
            {mayEdit && <Link href={`/tasks/new?id=${task.id}`} className="btn btn-outline btn-sm">Edit</Link>}
            {mayEdit && (
              <form action={deleteTask}>
                <ConfirmButton message={`Delete ${task.taskNo}? This cannot be undone.`} className="btn btn-danger btn-sm">Delete</ConfirmButton>
              </form>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="border border-black bg-white p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="label">Checklist</div>
              <div className="mono text-[12px]">{doneCount}/{items.length}</div>
            </div>
            <div className="h-1 bg-[var(--border-light)] mb-3"><div className="h-1 bg-[var(--success)]" style={{ width: `${(doneCount / items.length) * 100}%` }} /></div>
            {items.map((it) => (
              <form key={it.id} action={toggleItem} className="flex items-center gap-2 py-1.5 border-b border-[var(--border-light)] last:border-0">
                <input type="hidden" name="item" value={it.id} />
                <button disabled={!mayAct} className={`w-5 h-5 border border-black flex items-center justify-center text-[12px] ${it.done ? "bg-black text-white" : ""}`} aria-label={it.done ? "Uncheck" : "Check"}>
                  {it.done ? "✓" : ""}
                </button>
                <span className={`text-[14px] flex-1 ${it.done ? "line-through text-[var(--muted)]" : ""}`}>{it.text}</span>
                {it.done && it.doneBy ? <span className="text-[11px] text-[var(--muted)]">{uname.get(it.doneBy)}</span> : null}
              </form>
            ))}
          </div>
        )}

        {(reminders.length > 0 || task.voice || images.length > 0) && (
          <div className="border border-black bg-white p-4 mb-4 flex flex-col gap-4">
            {reminders.length > 0 && (
              <div>
                <div className="label mb-2">Reminders</div>
                {reminders.map((r) => {
                  const at = task.startDate ? reminderAt(task.startDate, task.startTime, r.amount, r.unit as ReminderUnit, r.timing as ReminderTiming) : null;
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 text-[13px] py-1">
                      <span className="font-semibold">{REMINDER_CHANNELS.find((c) => c.value === r.channel)?.label}</span>
                      <span>{reminderLabel(r.amount, r.unit, r.timing)}</span>
                      <span className="text-[var(--muted)]">{at ? `→ ${dmy(at.slice(0, 10))} ${at.slice(11)}` : "→ needs a start date"}</span>
                      {r.channel === "WHATSAPP" && people.assignees.map((u) => {
                        const ph = (contacts.get(u)?.phone ?? "").replace(/\D/g, "");
                        return ph ? <a key={u} className="underline text-[12px]" target="_blank" rel="noreferrer" href={`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`}>WhatsApp {uname.get(u)}</a> : <span key={u} className="text-[11px] text-[var(--danger)]">{uname.get(u)}: no phone</span>;
                      })}
                      {r.channel === "EMAIL" && people.assignees.map((u) => {
                        const em = contacts.get(u)?.email ?? "";
                        return em ? <a key={u} className="underline text-[12px]" href={`mailto:${em}?subject=${encodeURIComponent(`Task ${task.taskNo}`)}&body=${encodeURIComponent(msg)}`}>Email {uname.get(u)}</a> : <span key={u} className="text-[11px] text-[var(--danger)]">{uname.get(u)}: no email</span>;
                      })}
                    </div>
                  );
                })}
              </div>
            )}
            {task.voice && (
              <div>
                <div className="label mb-2">Voice note</div>
                <audio controls src={task.voice} className="w-full max-w-[420px]" />
              </div>
            )}
            {images.length > 0 && (
              <div>
                <div className="label mb-2">Attachments</div>
                <div className="flex flex-wrap gap-2">
                  {images.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Attachment ${i + 1}`} className="w-28 h-28 object-cover border border-[var(--border)]" /></a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border border-black bg-white p-4 mb-4">
          <div className="label mb-2">Comments</div>
          {comments.length === 0 && <div className="text-[13px] text-[var(--muted)] mb-2">No comments yet.</div>}
          {comments.map((c) => (
            <div key={c.id} className="py-2 border-b border-[var(--border-light)]">
              <div className="text-[11px] text-[var(--muted)]">{uname.get(c.authorUserId) ?? "Unknown"} · {stamp(c.createdAt)}</div>
              <div className="text-[14px] whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}
          <form action={addComment} className="flex gap-2 mt-3">
            <input name="body" className="input-box" placeholder="Write a comment" autoComplete="off" />
            <button className="btn btn-sm">Post</button>
          </form>
        </div>

        <details className="border border-[var(--border)] bg-white p-4">
          <summary className="label cursor-pointer">History ({history.length})</summary>
          <div className="mt-2">
            {history.map((h) => (
              <div key={h.id} className="text-[12px] py-1 border-b border-[var(--border-light)]">
                <span className="text-[var(--muted)]">{stamp(h.createdAt)}</span> · {uname.get(h.actorUserId) ?? "Unknown"} · {h.action}
                {h.fromValue || h.toValue ? ` ${h.fromValue ? `${h.action === "STATUS" ? statusLabel(h.fromValue) : h.fromValue} → ` : ""}${h.action === "STATUS" ? statusLabel(h.toValue) : h.toValue ?? ""}` : ""}
              </div>
            ))}
          </div>
        </details>
      </div>
    </Shell>
  );
}
