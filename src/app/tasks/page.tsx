import Link from "next/link";
import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { today } from "@/lib/time";
import {
  FINISHED,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  categoryLabel,
  ensureTaskTables,
  isOverdue,
  materializeRepeats,
  peopleFor,
  priorityClass,
  priorityLabel,
  priorityRank,
  statusLabel,
} from "@/lib/tasks";
import { parseMonthDates, parseWeekdays, repeatLabel, type RepeatRule, type RepeatUnit } from "@/lib/task-schedule";

export const dynamic = "force-dynamic";

type SP = { tab?: string; status?: string; category?: string; priority?: string; user?: string; q?: string; done?: string };

const TABS = [
  { value: "", label: "All" },
  { value: "mine", label: "Assigned to me" },
  { value: "byme", label: "Assigned by me" },
  { value: "loop", label: "In loop" },
];

function qs(p: SP, o: Partial<SP>) {
  const m: Record<string, string | undefined> = { ...p, ...o };
  const s = Object.entries(m).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
  return s ? `?${s}` : "";
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const p = await searchParams;
  const session = await requireSession();
  await ensureTaskTables();
  await materializeRepeats();

  const asOf = today();
  const users = await db.select({ id: schema.users.id, fullName: schema.users.fullName }).from(schema.users);
  const uname = new Map(users.map((u) => [u.id, u.fullName]));
  const all = await db.select({
    id: schema.tasks.id, taskNo: schema.tasks.taskNo, title: schema.tasks.title, category: schema.tasks.category,
    priority: schema.tasks.priority, status: schema.tasks.status, creatorUserId: schema.tasks.creatorUserId,
    startDate: schema.tasks.startDate, startTime: schema.tasks.startTime, repeatRule: schema.tasks.repeatRule,
    repeatEvery: schema.tasks.repeatEvery, seriesId: schema.tasks.seriesId, repeatDays: schema.tasks.repeatDays, repeatUnit: schema.tasks.repeatUnit, repeatDates: schema.tasks.repeatDates, loomNo: schema.tasks.loomNo, shed: schema.tasks.shed,
  }).from(schema.tasks).orderBy(desc(schema.tasks.id));
  const people = await peopleFor(all.map((t) => t.id));
  const me = session.userId;
  const userId = p.user && /^\d+$/.test(p.user) ? parseInt(p.user, 10) : null;
  const q = (p.q ?? "").trim().toLowerCase();

  const inTab = all.filter((t) => {
    const pp = people.get(t.id);
    if (p.tab === "mine") return pp?.assignees.includes(me);
    if (p.tab === "byme") return t.creatorUserId === me;
    if (p.tab === "loop") return pp?.loop.includes(me);
    return true;
  });
  const rows = inTab
    .filter((t) => (p.status ? t.status === p.status : p.done === "1" || !FINISHED.includes(t.status)))
    .filter((t) => !p.category || t.category === p.category)
    .filter((t) => !p.priority || t.priority === p.priority)
    .filter((t) => !userId || people.get(t.id)?.assignees.includes(userId))
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.taskNo.toLowerCase().includes(q))
    .sort((a, b) =>
      Number(isOverdue(b, asOf)) - Number(isOverdue(a, asOf)) ||
      (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") ||
      priorityRank(a.priority) - priorityRank(b.priority),
    );

  const open = inTab.filter((t) => !FINISHED.includes(t.status));
  const stats = [
    { label: "Open", n: open.length },
    { label: "Due today", n: open.filter((t) => t.startDate === asOf).length },
    { label: "Overdue", n: open.filter((t) => isOverdue(t, asOf)).length },
    { label: "Repeat series", n: inTab.filter((t) => t.repeatRule !== "NONE" && t.seriesId === t.id).length },
  ];
  const names = (ids: number[] = []) => ids.map((i) => uname.get(i) ?? `#${i}`).join(", ");

  return (
    <Shell active="tickets">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-3">
          <h1 className="page-title">Tasks</h1>
          <div className="flex gap-2 flex-wrap">
            <ExcelExportButton
              rows={rows.map((t) => ({
                taskNo: t.taskNo, title: t.title, category: categoryLabel(t.category), priority: priorityLabel(t.priority),
                status: statusLabel(t.status), start: t.startDate ?? "", users: names(people.get(t.id)?.assignees),
                by: uname.get(t.creatorUserId) ?? "", repeat: repeatLabel({ rule: t.repeatRule as RepeatRule, every: t.repeatEvery, unit: t.repeatUnit as RepeatUnit | null, days: parseWeekdays(t.repeatDays), dates: parseMonthDates(t.repeatDates) }),
              }))}
              columns={[
                { key: "taskNo", label: "Task #" }, { key: "title", label: "Title" }, { key: "category", label: "Category" },
                { key: "priority", label: "Priority" }, { key: "status", label: "Status" }, { key: "start", label: "Start" },
                { key: "users", label: "Users" }, { key: "by", label: "Assigned by" }, { key: "repeat", label: "Repeat" },
              ]}
              filename="tasks"
              title="Tasks"
            />
            <Link href="/tasks/new" className="btn btn-sm">+ Assign Task</Link>
          </div>
        </div>

        <div className="flex gap-0 border-b border-black mb-4 overflow-x-auto">
          {TABS.map((t) => (
            <Link key={t.value} href={`/tasks${qs(p, { tab: t.value || undefined })}`} className={`px-4 py-2 text-[13px] whitespace-nowrap ${(p.tab ?? "") === t.value ? "bg-black text-white font-semibold" : ""}`}>
              {t.label}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white p-3">
              <div className="mono text-xl font-bold">{s.n}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <form method="GET" action="/tasks" className="flex flex-wrap gap-2 items-end mb-4">
          {p.tab && <input type="hidden" name="tab" value={p.tab} />}
          <input name="q" defaultValue={p.q} placeholder="Search title / task #" className="input-box !w-[200px]" />
          <select name="status" defaultValue={p.status ?? ""} className="input-box !w-[140px]">
            <option value="">Not done</option>
            {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select name="category" defaultValue={p.category ?? ""} className="input-box !w-[160px]">
            <option value="">All categories</option>
            {TASK_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select name="priority" defaultValue={p.priority ?? ""} className="input-box !w-[120px]">
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select name="user" defaultValue={p.user ?? ""} className="input-box !w-[160px]">
            <option value="">All users</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" name="done" value="1" defaultChecked={p.done === "1"} /> include done</label>
          <button className="btn btn-sm">Apply</button>
          <Link href={`/tasks${p.tab ? `?tab=${p.tab}` : ""}`} className="btn btn-outline btn-sm">Clear</Link>
        </form>

        {rows.length === 0 ? (
          <div className="border border-[var(--border)] p-8 text-center text-[13px] text-[var(--muted)]">
            No tasks here. <Link href="/tasks/new" className="underline">Assign one</Link>.
          </div>
        ) : (
          <div className="flex flex-col border border-black divide-y divide-[var(--border-light)] bg-white">
            {rows.map((t) => {
              const pp = people.get(t.id);
              const late = isOverdue(t, asOf);
              const rep = repeatLabel({ rule: t.repeatRule as RepeatRule, every: t.repeatEvery, unit: t.repeatUnit as RepeatUnit | null, days: parseWeekdays(t.repeatDays), dates: parseMonthDates(t.repeatDates) });
              return (
                <Link key={t.id} href={`/tasks/${t.id}`} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 hover:bg-[var(--surface)]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono text-[11px] text-[var(--muted)]">{t.taskNo}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 font-semibold ${priorityClass(t.priority)}`}>{priorityLabel(t.priority)}</span>
                      <span className="text-[11px] text-[var(--muted)]">{categoryLabel(t.category)}</span>
                      {rep && <span className="text-[10px] border border-[var(--border)] px-1.5">{rep}</span>}
                    </div>
                    <div className="font-semibold text-[14px] truncate">{t.title}</div>
                    <div className="text-[12px] text-[var(--muted)] truncate">
                      {pp?.assignees.length ? names(pp.assignees) : "Unassigned"}
                      {t.loomNo != null && ` · Shed ${t.shed} Loom ${t.loomNo}`}
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0 text-[12px]">
                    <span className={late ? "text-[var(--danger)] font-bold" : ""}>
                      {t.startDate ? `${t.startDate.slice(8, 10)}/${t.startDate.slice(5, 7)}/${t.startDate.slice(0, 4)}${t.startTime ? ` ${t.startTime}` : ""}` : "No date"}
                      {late && " · overdue"}
                    </span>
                    <span className="font-semibold">{statusLabel(t.status)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
