import Link from "next/link";
import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { TaskForm, type TaskFormInitial } from "../task-form";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  ensureTaskTables,
  nextTaskNo,
  peopleFor,
  isTaskAdmin,
} from "@/lib/tasks";
import { REPEAT_RULES, parseMonthDates, parseWeekdays, type RepeatRule } from "@/lib/task-schedule";

export const dynamic = "force-dynamic";

type SP = { id?: string; loom?: string; more?: string; saved?: string; error?: string };

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const UNITS = ["minutes", "hours", "days"];
const CHANNELS = ["APP", "WHATSAPP", "EMAIL"];

export default async function AssignTaskPage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = await searchParams;
  const me = await requireSession();
  await ensureTaskTables();

  const editId = params.id && /^\d+$/.test(params.id) ? parseInt(params.id, 10) : null;
  const [task] = editId ? await db.select().from(schema.tasks).where(eq(schema.tasks.id, editId)) : [];
  if (editId && !task) notFound();
  if (editId && !isTaskAdmin(me.roleName)) redirect(`/tasks/${editId}`);

  const users = (await db.select().from(schema.users))
    .filter((u) => u.roleName !== "superadmin" && u.status === "A")
    .map((u) => ({ value: String(u.id), label: u.fullName }));
  const looms = (await db.select().from(schema.looms)).map((l) => ({ value: `${l.shed}|${l.loomNo}`, label: `Shed ${l.shed} · Loom ${l.loomNo}` }));

  async function saveTask(formData: FormData) {
    "use server";
    const session = await requireSession();
    await ensureTaskTables();
    const s = (k: string) => String(formData.get(k) ?? "").trim();
    const id = parseInt(s("edit_id"), 10);
    const isEdit = Number.isFinite(id) && id > 0;
    if (isEdit && !isTaskAdmin(session.roleName)) redirect(`/tasks/${id}`);
    const back = isEdit ? `/tasks/new?id=${id}` : "/tasks/new";

    const title = s("title");
    if (!title) redirect(`${back}${isEdit ? "&" : "?"}error=title`);
    const category = TASK_CATEGORIES.some((c) => c.value === s("category")) ? s("category") : "GENERAL";
    const priority = TASK_PRIORITIES.some((p) => p.value === s("priority")) ? s("priority") : "NORMAL";
    const startDate = isIso(s("start_date")) ? s("start_date") : null;
    const startTime = /^\d{2}:\d{2}$/.test(s("start_time")) ? s("start_time") : null;
    const rule = (REPEAT_RULES.some((r) => r.value === s("repeat_rule")) ? s("repeat_rule") : "NONE") as RepeatRule;
    const every = Math.max(1, parseInt(s("repeat_every"), 10) || 1);
    const unit = s("repeat_unit") === "MONTH" ? "MONTH" : "WEEK";
    const days = parseWeekdays(s("repeat_days"));
    const dates = parseMonthDates(s("repeat_dates"));
    const usesDays = rule === "WEEKLY" || (rule === "CUSTOM" && unit === "WEEK");
    const usesDates = rule === "MONTHLY" || (rule === "CUSTOM" && unit === "MONTH");
    const repeatEnd = isIso(s("repeat_end")) ? s("repeat_end") : null;
    if (rule !== "NONE" && !startDate) redirect(`${back}${isEdit ? "&" : "?"}error=repeat_start`);
    const validUsers = new Set(users.map((u) => Number(u.value)));
    const assignees = Array.from(new Set(formData.getAll("assignee").map((v) => parseInt(String(v), 10)))).filter((n) => validUsers.has(n));
    const loop = Array.from(new Set(formData.getAll("loop").map((v) => parseInt(String(v), 10)))).filter((n) => validUsers.has(n) && !assignees.includes(n));
    const checklist = formData.getAll("checklist").map((v) => String(v).trim()).filter(Boolean);
    let reminders: { channel: string; amount: number; unit: string; timing: string }[] = [];
    try {
      const raw = JSON.parse(s("reminders") || "[]");
      if (Array.isArray(raw)) {
        reminders = raw
          .map((r) => ({ channel: String(r?.channel), amount: Math.max(0, Math.floor(Number(r?.amount) || 0)), unit: String(r?.unit), timing: r?.timing === "AFTER" ? "AFTER" : "BEFORE" }))
          .filter((r) => CHANNELS.includes(r.channel) && UNITS.includes(r.unit))
          .slice(0, 10);
      }
    } catch {
      reminders = [];
    }
    const [shedRaw, loomRaw] = s("loom").split("|");
    const loomNo = parseInt(loomRaw ?? "", 10);
    const voice = s("voice").startsWith("data:audio/") ? s("voice") : null;
    const img = s("img") || null;
    const now = new Date().toISOString();

    const fields = {
      title,
      description: s("description") || null,
      category,
      priority,
      startDate,
      startTime,
      shed: Number.isFinite(loomNo) ? shedRaw || null : null,
      loomNo: Number.isFinite(loomNo) ? loomNo : null,
      img,
      voice,
      updatedAt: now,
    };
    const repeatFields = {
      repeatRule: rule,
      repeatEvery: rule === "PERIODICALLY" || rule === "CUSTOM" ? every : null,
      repeatUnit: rule === "CUSTOM" ? unit : null,
      repeatDays: usesDays && days.length ? days.join(",") : null,
      repeatDates: usesDates && dates.length ? dates.join(",") : null,
      repeatEnd: rule === "NONE" ? null : repeatEnd,
    };

    const taskId = await db.transaction(async (tx) => {
      let tid: number;
      if (isEdit) {
        const [cur] = await tx.select().from(schema.tasks).where(eq(schema.tasks.id, id));
        if (!cur) return 0;
        // A repeat copy follows its series; only the series' first task sets the repeat.
        const isCopy = cur.seriesId != null && cur.seriesId !== cur.id;
        await tx.update(schema.tasks).set({
          ...fields,
          ...(isCopy ? {} : { ...repeatFields, seriesId: rule === "NONE" ? cur.seriesId : cur.id }),
        }).where(eq(schema.tasks.id, id));
        tid = id;
        const oldItems = await tx.select().from(schema.taskChecklist).where(eq(schema.taskChecklist.taskId, id));
        await tx.delete(schema.taskChecklist).where(eq(schema.taskChecklist.taskId, id));
        if (checklist.length) {
          await tx.insert(schema.taskChecklist).values(checklist.map((text, i) => {
            const was = oldItems.find((o) => o.text === text);
            return { taskId: id, srno: i + 1, text, done: was?.done ?? 0, doneBy: was?.doneBy ?? null, doneAt: was?.doneAt ?? null };
          }));
        }
        await tx.delete(schema.taskUsers).where(eq(schema.taskUsers.taskId, id));
        await tx.delete(schema.taskReminders).where(eq(schema.taskReminders.taskId, id));
        await tx.insert(schema.taskHistory).values({ taskId: id, actorUserId: session.userId, action: "EDITED", createdAt: now });
      } else {
        const [row] = await tx.insert(schema.tasks).values({
          taskNo: await nextTaskNo(tx),
          ...fields,
          ...repeatFields,
          status: "OPEN",
          creatorUserId: session.userId,
          createdAt: now,
        }).returning({ id: schema.tasks.id });
        tid = row.id;
        if (rule !== "NONE") await tx.update(schema.tasks).set({ seriesId: tid }).where(eq(schema.tasks.id, tid));
        if (checklist.length) await tx.insert(schema.taskChecklist).values(checklist.map((text, i) => ({ taskId: tid, srno: i + 1, text })));
        await tx.insert(schema.taskHistory).values({ taskId: tid, actorUserId: session.userId, action: "CREATED", toValue: "OPEN", createdAt: now });
      }
      const people = [
        ...assignees.map((userId) => ({ taskId: tid, userId, role: "ASSIGNEE" })),
        ...loop.map((userId) => ({ taskId: tid, userId, role: "LOOP" })),
      ];
      if (people.length) await tx.insert(schema.taskUsers).values(people);
      if (reminders.length) await tx.insert(schema.taskReminders).values(reminders.map((r) => ({ taskId: tid, ...r })));
      return tid;
    });
    if (!taskId) notFound();

    revalidatePath("/tasks");
    if (!isEdit && s("assign_more") === "1") redirect(`/tasks/new?more=1&saved=${taskId}`);
    redirect(`/tasks/${taskId}`);
  }

  let initial: TaskFormInitial = {
    title: "", description: "", checklist: [], assignees: [], loop: [], startDate: "", startTime: "",
    priority: "NORMAL", category: "GENERAL", repeatRule: "NONE", repeatEvery: null, repeatUnit: "WEEK", repeatDays: [], repeatDates: [], repeatEnd: "",
    reminders: [], loom: "", img: "", voice: "",
  };
  if (!task) {
    const p = (params.loom ?? "").trim();
    initial.loom = p.includes("|") ? p : looms.find((l) => l.value.endsWith(`|${p}`))?.value ?? "";
    if (initial.loom) initial.category = "LOOM_BREAKDOWN";
  } else {
    const people = (await peopleFor([task.id])).get(task.id);
    const items = await db.select().from(schema.taskChecklist).where(eq(schema.taskChecklist.taskId, task.id)).orderBy(schema.taskChecklist.srno);
    const rems = await db.select().from(schema.taskReminders).where(eq(schema.taskReminders.taskId, task.id));
    initial = {
      title: task.title, description: task.description ?? "", checklist: items.map((i) => i.text),
      assignees: people?.assignees ?? [], loop: people?.loop ?? [],
      startDate: task.startDate ?? "", startTime: task.startTime ?? "",
      priority: task.priority, category: task.category,
      repeatRule: task.repeatRule as RepeatRule, repeatEvery: task.repeatEvery, repeatUnit: task.repeatUnit === "MONTH" ? "MONTH" : "WEEK", repeatDays: parseWeekdays(task.repeatDays), repeatDates: parseMonthDates(task.repeatDates), repeatEnd: task.repeatEnd ?? "",
      reminders: rems.map((r) => ({ channel: r.channel, amount: r.amount, unit: r.unit, timing: r.timing })),
      loom: task.loomNo != null ? `${task.shed}|${task.loomNo}` : "", img: task.img ?? "", voice: task.voice ?? "",
    };
  }
  const isCopy = !!task && task.seriesId != null && task.seriesId !== task.id;
  const [savedTask] = params.saved && /^\d+$/.test(params.saved)
    ? await db.select({ id: schema.tasks.id, taskNo: schema.tasks.taskNo, title: schema.tasks.title }).from(schema.tasks).where(and(eq(schema.tasks.id, parseInt(params.saved, 10))))
    : [];

  return (
    <Shell active="tickets">
      <div className="animate-in max-w-[640px]">
        <form action={saveTask} className="border border-black bg-white">
          <input type="hidden" name="edit_id" value={task?.id ?? ""} />
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-light)]">
            <h1 className="text-[17px] font-bold">{task ? `Edit Task ${task.taskNo}` : "Assign New Task"}</h1>
            {!task ? (
              <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                <input type="checkbox" name="assign_more" value="1" defaultChecked={params.more === "1"} /> Assign More Task
              </label>
            ) : (
              <Link href={`/tasks/${task.id}`} className="btn btn-outline btn-sm">Cancel</Link>
            )}
          </div>
          {savedTask && (
            <div className="mx-4 mt-3 border border-[var(--success)] px-3 py-2 text-[12px]">
              Assigned <Link href={`/tasks/${savedTask.id}`} className="underline mono">{savedTask.taskNo}</Link> — {savedTask.title}. Add the next one.
            </div>
          )}
          {params.error === "title" && <div className="mx-4 mt-3 border-2 border-[var(--danger)] px-3 py-2 text-[12px] text-[var(--danger)]">A title is required.</div>}
          {params.error === "repeat_start" && <div className="mx-4 mt-3 border-2 border-[var(--danger)] px-3 py-2 text-[12px] text-[var(--danger)]">A repeating task needs a Start Date. Nothing was saved.</div>}
          {isCopy && <div className="mx-4 mt-3 border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--muted)]">This is one repeat of a series — changes apply to this copy only. Change the repeat on the series&apos; first task.</div>}
          <div className="p-4">
            <TaskForm
              initial={initial}
              users={users}
              categories={TASK_CATEGORIES}
              priorities={TASK_PRIORITIES}
              looms={looms}
              isEdit={!!task}
            />
          </div>
        </form>
        {!task && (
          <div className="mt-3">
            <Link href="/tasks" className="text-[13px] underline">← All tasks</Link>
          </div>
        )}
      </div>
    </Shell>
  );
}
