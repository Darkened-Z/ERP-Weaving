import Link from "next/link";
import { Shell } from "@/components/shell";
import { DateBox } from "@/components/date-box";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { addDays, toKarachiDate, today } from "@/lib/time";
import { categoryLabel, ensureTaskTables, isTaskAdmin, materializeRepeats, priorityLabel } from "@/lib/tasks";
import { OUTCOME_LABEL, outcome, score, type Outcome, type Score } from "@/lib/task-performance";

export const dynamic = "force-dynamic";

const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n)}%`);
const OUT_CLASS: Record<Outcome, string> = {
  ON_TIME: "bg-[var(--success)] text-white",
  LATE: "border border-[var(--danger)] text-[var(--danger)]",
  OVERDUE: "bg-[var(--danger)] text-white",
  PENDING: "border border-[var(--border)]",
  NO_DATE: "text-[var(--muted)]",
};

/**
 * Who does their tasks on time. Every assignee of a task due in the period is
 * scored on it: on time (finished on or before its date), late, overdue
 * (past its date, still open) or pending (not due yet). Admins see everyone;
 * anyone else sees only themselves.
 */
export default async function TaskReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; user?: string }> }) {
  const session = await requireSession();
  await ensureTaskTables();
  await materializeRepeats();
  const p = await searchParams;
  const asOf = today();
  const to = p.to?.trim() || addDays(asOf, 7);
  const from = p.from?.trim() || addDays(asOf, -29);
  const admin = isTaskAdmin(session.roleName);
  const only = admin ? (p.user && /^\d+$/.test(p.user) ? parseInt(p.user, 10) : null) : session.userId;

  const tasks = await db.select().from(schema.tasks).where(and(gte(schema.tasks.startDate, from), lte(schema.tasks.startDate, to)));
  const links = tasks.length
    ? await db.select().from(schema.taskUsers).where(and(inArray(schema.taskUsers.taskId, tasks.map((t) => t.id)), eq(schema.taskUsers.role, "ASSIGNEE")))
    : [];
  const users = await db.select({ id: schema.users.id, name: schema.users.fullName, status: schema.users.status }).from(schema.users);
  const uname = new Map(users.map((u) => [u.id, u.name]));
  const byId = new Map(tasks.map((t) => [t.id, t]));

  type Item = { task: (typeof tasks)[number]; outcome: Outcome; daysLate: number; doneOn: string | null };
  const perUser = new Map<number, Item[]>();
  for (const l of links) {
    if (only != null && l.userId !== only) continue;
    const t = byId.get(l.taskId)!;
    const doneOn = t.doneAt ? toKarachiDate(new Date(t.doneAt)) : null;
    const o = outcome(t.startDate, doneOn, asOf);
    (perUser.get(l.userId) ?? perUser.set(l.userId, []).get(l.userId)!).push({ task: t, doneOn, ...o });
  }

  const rows = [...perUser.entries()]
    .map(([userId, items]) => ({ userId, name: uname.get(userId) ?? `User ${userId}`, items, s: score(items) }))
    .sort((a, b) => (b.s.onTimePct ?? -1) - (a.s.onTimePct ?? -1) || b.s.total - a.s.total || a.name.localeCompare(b.name));
  const all = score(rows.flatMap((r) => r.items));
  const detail = only != null ? rows.find((r) => r.userId === only) : null;
  const qs = (u?: number) => `/tasks/report?from=${from}&to=${to}${u != null ? `&user=${u}` : ""}`;

  const Bar = ({ s }: { s: Score }) => {
    const due = s.onTime + s.late + s.overdue;
    if (!due) return <div className="h-2 bg-[var(--border-light)]" />;
    return (
      <div className="flex h-2 w-full" title={`${s.onTime} on time · ${s.late} late · ${s.overdue} overdue`}>
        <div style={{ width: `${(s.onTime / due) * 100}%`, background: "var(--success)" }} />
        <div style={{ width: `${(s.late / due) * 100}%`, background: "#f59e0b" }} />
        <div style={{ width: `${(s.overdue / due) * 100}%`, background: "var(--danger)" }} />
      </div>
    );
  };

  return (
    <Shell active="tickets">
      <div className="animate-in">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <div>
            <h1 className="page-title">Task Report</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              Tasks due {dmy(from)} – {dmy(to)} · on time = finished on or before its date
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <PrintButton />
            <ExcelExportButton
              rows={(detail ? [detail] : rows).flatMap((r) => r.items.map((i) => ({
                user: r.name, taskNo: i.task.taskNo, title: i.task.title, category: categoryLabel(i.task.category), priority: priorityLabel(i.task.priority),
                due: i.task.startDate ?? "", done: i.doneOn ?? "", result: OUTCOME_LABEL[i.outcome], daysLate: i.daysLate || "",
              })))}
              columns={[
                { key: "user", label: "User" }, { key: "taskNo", label: "Task #" }, { key: "title", label: "Title" }, { key: "category", label: "Category" },
                { key: "priority", label: "Priority" }, { key: "due", label: "Due" }, { key: "done", label: "Done" }, { key: "result", label: "Result" }, { key: "daysLate", label: "Days late" },
              ]}
              filename="task-report"
              title="Task Report"
            />
            <Link href="/tasks" className="btn btn-outline btn-sm">Tasks</Link>
          </div>
        </div>

        <form className="flex flex-wrap items-end gap-2 mb-5 no-print">
          <div><label className="label block mb-1">From</label><DateBox name="from" defaultValue={from} /></div>
          <div><label className="label block mb-1">To</label><DateBox name="to" defaultValue={to} /></div>
          {admin && (
            <div>
              <label className="label block mb-1">User</label>
              <select name="user" defaultValue={only ?? ""} className="input-box" style={{ minWidth: 180 }}>
                <option value="">All users</option>
                {users.filter((u) => u.status === "A").sort((a, b) => a.name.localeCompare(b.name)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-sm">Apply</button>
          <Link href="/tasks/report" className="btn btn-outline btn-sm">Clear</Link>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-black border border-black mb-5">
          {[
            { l: "On time", n: all.onTime, c: "text-[var(--success)]" },
            { l: "Late", n: all.late, c: "text-[#b45309]" },
            { l: "Overdue", n: all.overdue, c: "text-[var(--danger)]" },
            { l: "Pending", n: all.pending, c: "" },
            { l: "On-time rate", n: pct(all.onTimePct), c: "" },
          ].map((s) => (
            <div key={s.l} className="bg-white p-3">
              <div className={`mono text-xl font-bold ${s.c}`}>{s.n}</div>
              <div className="stat-label">{s.l}</div>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="border border-[var(--border)] p-8 text-center text-[13px] text-[var(--muted)]">No tasks due in this period.</div>
        ) : (
          <div className="overflow-x-auto border border-black bg-white mb-6">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="text-left">User</th>
                  <th className="text-right">Tasks</th>
                  <th className="text-right">On time</th>
                  <th className="text-right">Late</th>
                  <th className="text-right">Overdue</th>
                  <th className="text-right">Pending</th>
                  <th className="text-right">Days late</th>
                  <th className="text-right">Done %</th>
                  <th className="text-right">On-time %</th>
                  <th style={{ minWidth: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className={detail?.userId === r.userId ? "bg-[#f5f5f5]" : ""}>
                    <td className="font-semibold"><Link href={qs(r.userId)} className="underline">{r.name}</Link></td>
                    <td className="mono text-right">{r.s.total}</td>
                    <td className="mono text-right text-[var(--success)]">{r.s.onTime}</td>
                    <td className="mono text-right text-[#b45309]">{r.s.late}</td>
                    <td className="mono text-right text-[var(--danger)] font-semibold">{r.s.overdue || ""}</td>
                    <td className="mono text-right">{r.s.pending}</td>
                    <td className="mono text-right">{r.s.lateDays || ""}</td>
                    <td className="mono text-right">{pct(r.s.donePct)}</td>
                    <td className="mono text-right font-bold">{pct(r.s.onTimePct)}</td>
                    <td><Bar s={r.s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detail && (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <div className="label">{detail.name} — {detail.items.length} task{detail.items.length !== 1 ? "s" : ""}</div>
              {admin && <Link href={qs()} className="text-[12px] underline no-print">All users</Link>}
            </div>
            <div className="overflow-x-auto border border-black bg-white">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className="text-left">Task</th>
                    <th className="text-left">Title</th>
                    <th className="text-left">Due</th>
                    <th className="text-left">Done</th>
                    <th className="text-left">Result</th>
                    <th className="text-right">Days late</th>
                  </tr>
                </thead>
                <tbody>
                  {[...detail.items].sort((a, b) => (b.task.startDate ?? "").localeCompare(a.task.startDate ?? "")).map((i) => (
                    <tr key={i.task.id}>
                      <td className="mono"><Link href={`/tasks/${i.task.id}`} className="underline">{i.task.taskNo}</Link></td>
                      <td>{i.task.title}</td>
                      <td className="mono">{dmy(i.task.startDate)}{i.task.startTime ? ` ${i.task.startTime}` : ""}</td>
                      <td className="mono">{dmy(i.doneOn)}</td>
                      <td><span className={`text-[11px] px-1.5 py-0.5 font-semibold ${OUT_CLASS[i.outcome]}`}>{OUTCOME_LABEL[i.outcome]}</span></td>
                      <td className="mono text-right">{i.daysLate || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
