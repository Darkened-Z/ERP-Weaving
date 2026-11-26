import Link from "next/link";
import { TaskAreaChart, TaskStatusRing } from "@/components/task-charts";
import { FINISHED, isOverdue, priorityClass, priorityLabel, statusLabel } from "@/lib/tasks";
import type { TaskDashboard } from "@/lib/task-dashboard";

export type BoardTask = {
  id: number; taskNo: string; title: string; priority: string; status: string;
  startDate: string | null; startTime: string | null; assignees: string[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}` : "No date");

/** Status colours in the ERP palette: navy family, red only for blocked. */
export const STATUS_COLOR: Record<string, string> = {
  DONE: "var(--accent)", IN_PROGRESS: "#4a6fa5", OPEN: "#a0b4d6", BLOCKED: "var(--danger)",
};
const COLUMNS = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
const COLUMN_LABEL: Record<string, string> = { OPEN: "To Do", IN_PROGRESS: "In Progress", BLOCKED: "Blocked", DONE: "Done" };

const ACTION: Record<string, string> = {
  CREATED: "created", REPEATED: "repeated", EDITED: "edited", CHECKED: "ticked", UNCHECKED: "unticked", IMPORTED: "imported",
};
const activityText = (a: TaskDashboard["activity"][number]) =>
  a.action === "STATUS" ? <>moved <b>{a.title}</b> to {COLUMN_LABEL[a.to ?? ""] ?? statusLabel(a.to)}</>
  : a.action === "CHECKED" || a.action === "UNCHECKED" ? <>{ACTION[a.action]} “{a.to}” on <b>{a.title}</b></>
  : <>{ACTION[a.action] ?? a.action.toLowerCase()} <b>{a.title}</b></>;

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return `${m || 1}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

/** On track ≥ 80 % on time, behind ≥ 50 %, otherwise late — same as the phone app. */
const standing = (pct: number | null) =>
  pct == null ? { label: "Nothing due", cls: "border-[var(--border)] text-[var(--muted)]" }
  : pct >= 80 ? { label: "On track", cls: "border-[var(--success)] text-[#15803d]" }
  : pct >= 50 ? { label: "Behind", cls: "border-[var(--warning)] text-[#b45309]" }
  : { label: "Late", cls: "border-[var(--danger)] text-[var(--danger)]" };

function Initials({ name }: { name: string }) {
  const s = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="w-8 h-8 shrink-0 bg-[var(--accent)] text-white text-[12px] font-bold flex items-center justify-center">{s || "?"}</span>;
}

function Panel({ title, sub, link, children, className = "" }: { title: string; sub?: string; link?: { href: string; label: string }; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-black bg-white p-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-[14px] font-bold uppercase tracking-wide">{title}</h2>
        {link ? <Link prefetch={false} href={link.href} className="text-[12px] underline">{link.label}</Link> : sub && <span className="text-[11px] text-[var(--muted)]">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function Trend({ label, value, change, good }: { label: string; value: number; change: number; good: "up" | "down" }) {
  const better = change === 0 ? null : (change > 0) === (good === "up");
  return (
    <div className="bg-white p-4 transition-colors hover:bg-[var(--bg)]">
      <div className="stat-label">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="mono text-[28px] font-bold leading-none">{value}</span>
        <span className={`mono text-[12px] font-bold ${better == null ? "text-[var(--muted)]" : better ? "text-[#15803d]" : "text-[var(--danger)]"}`}>
          {change > 0 ? "▲" : change < 0 ? "▼" : "–"} {Math.abs(change)}%
        </span>
      </div>
      <div className="text-[11px] text-[var(--muted)] mt-1">vs last month</div>
    </div>
  );
}

export function DashboardView({ dash, open, asOf, mineHref, teamHref, mine, admin }: {
  dash: TaskDashboard; open: BoardTask[]; asOf: string; mineHref: string; teamHref: string; mine: boolean; admin: boolean;
}) {
  const m = dash.month;
  const due = [...open]
    .sort((a, b) => Number(isOverdue(b, asOf)) - Number(isOverdue(a, asOf)) || `${a.startDate ?? "9999"}${a.startTime ?? ""}`.localeCompare(`${b.startDate ?? "9999"}${b.startTime ?? ""}`))
    .slice(0, 6);
  const scored = dash.team.filter((t) => t.onTimePct != null);
  const teamPct = scored.length ? Math.round(scored.reduce((s, t) => s + t.onTime, 0) / Math.max(1, scored.reduce((s, t) => s + t.onTime + t.late + t.overdue, 0)) * 100) : null;
  const ring = COLUMNS.map((k) => ({
    key: k, label: k === "DONE" ? "Completed" : COLUMN_LABEL[k], value: dash.status[k] ?? 0, color: STATUS_COLOR[k],
    href: `/tasks?view=list&status=${k}${k === "DONE" ? "&done=1" : ""}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      {admin && (
        <div className="flex border border-black w-fit">
          <Link prefetch={false} href={teamHref} className={`px-4 py-1.5 text-[13px] ${!mine ? "bg-black text-white font-semibold" : ""}`}>Whole mill</Link>
          <Link prefetch={false} href={mineHref} className={`px-4 py-1.5 text-[13px] ${mine ? "bg-black text-white font-semibold" : ""}`}>Mine</Link>
        </div>
      )}

      {m && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-black border border-black">
          <Trend label="Tasks this month" value={m.total.value} change={m.total.change} good="up" />
          <Trend label="Completed" value={m.done.value} change={m.done.change} good="up" />
          <Trend label="Pending" value={m.pending.value} change={m.pending.change} good="down" />
          <Trend label="People with tasks" value={m.people.value} change={m.people.change} good="up" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Task overview" sub="Running total · 30 days" className="lg:col-span-2">
          <div className="flex gap-4 text-[11px] text-[var(--muted)] mb-2">
            <span className="flex items-center gap-1.5"><span className="w-3 h-[3px] bg-[var(--accent)]" /> Completed</span>
            <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-[var(--muted)]" /> Assigned</span>
          </div>
          <TaskAreaChart data={dash.series} />
        </Panel>

        <Panel title="Task status" link={{ href: "/tasks?view=board", label: "Board →" }}>
          <TaskStatusRing parts={ring} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Due soon" link={{ href: "/tasks?view=list", label: "View all →" }}>
          {due.length === 0 ? <p className="text-[13px] text-[var(--muted)]">Nothing due.</p> : (
            <div className="flex flex-col divide-y divide-[var(--border-light)]">
              {due.map((t) => {
                const late = isOverdue(t, asOf);
                return (
                  <Link prefetch={false} key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-3 py-2 -mx-2 px-2 hover:bg-[var(--bg)]">
                    <span className="w-1 self-stretch shrink-0" style={{ background: late ? "var(--danger)" : STATUS_COLOR[t.status] ?? "var(--border)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{t.title}</div>
                      <div className="text-[11px] text-[var(--muted)] truncate">{t.assignees.join(", ") || "Unassigned"} · {statusLabel(t.status)}</div>
                    </div>
                    <span className={`mono text-[11px] font-bold shrink-0 ${late ? "text-[var(--danger)]" : ""}`}>{shortDate(t.startDate)}{late ? " · late" : ""}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Team members" sub={teamPct != null ? `${teamPct}% on time · last 30 days` : "Last 30 days"} className="lg:col-span-2">
          {dash.team.length === 0 ? <p className="text-[13px] text-[var(--muted)]">No tasks were due in the last 30 days.</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {dash.team.map((p) => {
                const sd = standing(p.onTimePct);
                const segs = [
                  { n: p.onTime, c: "var(--success)", l: "On time" }, { n: p.late, c: "var(--warning)", l: "Late" },
                  { n: p.overdue, c: "var(--danger)", l: "Overdue" }, { n: p.pending, c: "var(--border)", l: "Pending" },
                ];
                return (
                  <details key={p.id} className="group border-b border-[var(--border-light)] py-2.5 -mx-2 px-2 hover:bg-[var(--bg)] open:bg-[var(--bg)]">
                    <summary className="list-none cursor-pointer">
                      <div className="flex items-center gap-3">
                        <Initials name={p.name} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold truncate">{p.name}</div>
                          <div className="text-[11px] text-[var(--muted)] truncate">{p.role ? `${p.role} · ` : ""}{p.total} task{p.total === 1 ? "" : "s"}</div>
                        </div>
                        <div className="text-right">
                          <div className="mono text-[18px] font-bold leading-none">{p.onTimePct == null ? "—" : `${Math.round(p.onTimePct)}%`}</div>
                          <span className={`inline-block mt-1 border px-1.5 text-[10px] font-bold ${sd.cls}`}>{sd.label}</span>
                        </div>
                      </div>
                      <div className="flex h-1.5 mt-2 bg-[var(--border-light)]">
                        {segs.map((s) => s.n > 0 && <span key={s.l} title={`${s.l}: ${s.n}`} style={{ flex: s.n, background: s.c }} />)}
                      </div>
                    </summary>
                    <div className="grid grid-cols-5 gap-px bg-[var(--border-light)] border border-[var(--border-light)] mt-2 text-center">
                      {[...segs.map((s) => ({ l: s.l, v: String(s.n) })), { l: "Done", v: p.donePct == null ? "—" : `${Math.round(p.donePct)}%` }].map((s) => (
                        <div key={s.l} className="bg-white py-1.5">
                          <div className="mono text-[14px] font-bold">{s.v}</div>
                          <div className="text-[10px] text-[var(--muted)]">{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Recent activity">
          {dash.activity.length === 0 ? <p className="text-[13px] text-[var(--muted)]">No activity yet.</p> : (
            <div className="flex flex-col divide-y divide-[var(--border-light)]">
              {dash.activity.slice(0, 8).map((a) => (
                <Link prefetch={false} key={a.id} href={`/tasks/${a.taskId}`} className="flex gap-3 py-2 -mx-2 px-2 hover:bg-[var(--bg)]">
                  <Initials name={a.by} />
                  <div className="flex-1 min-w-0 text-[12px]">
                    <div className="font-semibold">{a.by || "—"}</div>
                    <div className="text-[var(--muted)] line-clamp-2">{activityText(a)}</div>
                  </div>
                  <span className="text-[11px] text-[var(--muted)] shrink-0">{ago(a.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Kanban board" link={{ href: "/tasks?view=board", label: "View board →" }} className="lg:col-span-2">
          <BoardColumns tasks={open} asOf={asOf} limit={3} />
        </Panel>
      </div>
    </div>
  );
}

export function BoardColumns({ tasks, asOf, limit }: { tasks: BoardTask[]; asOf: string; limit?: number }) {
  return (
    <div className="grid grid-flow-col auto-cols-[minmax(180px,1fr)] gap-3 overflow-x-auto pb-1">
      {COLUMNS.map((col) => {
        const list = tasks
          .filter((t) => (col === "DONE" ? FINISHED.includes(t.status) : t.status === col))
          .sort((a, b) => (col === "DONE" ? 0 : (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999")));
        const shown = limit ? list.slice(0, limit) : list;
        return (
          <div key={col} className="bg-[var(--bg)] border border-[var(--border)] flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]" style={{ borderTop: `3px solid ${STATUS_COLOR[col]}` }}>
              <span className="text-[12px] font-bold uppercase tracking-wide flex-1">{COLUMN_LABEL[col]}</span>
              <span className="mono text-[11px] bg-white border border-[var(--border)] px-1.5">{list.length}</span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {shown.length === 0 && <div className="text-[12px] text-[var(--muted)] p-2">Nothing here.</div>}
              {shown.map((t) => {
                const late = isOverdue(t, asOf);
                return (
                  <Link prefetch={false} key={t.id} href={`/tasks/${t.id}`} className="block bg-white border border-[var(--border)] p-2.5 transition hover:border-black hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#000]">
                    <div className="text-[13px] font-semibold leading-snug">{t.title}</div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 font-semibold ${priorityClass(t.priority)}`}>{priorityLabel(t.priority)}</span>
                      <span className={`mono text-[11px] ${late ? "text-[var(--danger)] font-bold" : "text-[var(--muted)]"}`}>{shortDate(t.startDate)}</span>
                      <span className="text-[11px] text-[var(--muted)] ml-auto truncate max-w-[110px]">{t.assignees.join(", ")}</span>
                    </div>
                  </Link>
                );
              })}
              {limit && list.length > shown.length && (
                <Link prefetch={false} href="/tasks?view=board" className="text-[12px] underline text-center py-1">+{list.length - shown.length} more</Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
