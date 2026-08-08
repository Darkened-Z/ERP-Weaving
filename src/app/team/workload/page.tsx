import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
  getPriorityShort,
} from "../../tickets/constants";

export const dynamic = "force-dynamic";

type SP = {
  role?: string;
  sort?: string;
};

const PRIORITY_RANK: Record<string, number> = {
  P1_URGENT: 1,
  P2_HIGH: 2,
  P3_NORMAL: 3,
  P4_LOW: 4,
};

type TicketRow = typeof schema.tickets.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;

type UserWorkload = {
  user: UserRow;
  openCount: number;
  inProgressCount: number;
  blockedCount: number;
  overdueCount: number;
  resolvedWeek: number;
  totalActive: number;
  completionRate: number;
  nextDueDate: string | null;
  tickets: TicketRow[];
};

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((n) => parseInt(n, 10));
  const [by, bm, bd] = b.split("-").map((n) => parseInt(n, 10));
  const da = Date.UTC(ay, am - 1, ad);
  const db_ = Date.UTC(by, bm - 1, bd);
  return Math.round((da - db_) / 86400000);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function dueDiffText(dueDate: string, today: string): string {
  const diff = daysBetween(dueDate, today);
  if (diff < 0) return `OVERDUE ${Math.abs(diff)}d`;
  if (diff === 0) return "Due today";
  return `Due in ${diff}d`;
}

function nextDeadlineText(
  dueDate: string | null,
  today: string
): { text: string; color: string } {
  if (!dueDate) return { text: "No deadline", color: "text-[var(--muted)]" };
  const diff = daysBetween(dueDate, today);
  if (diff < 0)
    return {
      text: `${dueDate} (OVERDUE ${Math.abs(diff)}d)`,
      color: "text-[var(--danger)] font-bold",
    };
  if (diff === 0)
    return { text: `${dueDate} (today)`, color: "text-black font-bold" };
  if (diff <= 3)
    return { text: `${dueDate} (in ${diff}d)`, color: "text-black" };
  return { text: `${dueDate} (in ${diff}d)`, color: "text-[var(--muted)]" };
}

export default async function TeamWorkloadPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const params = await searchParams;
  const sortMode =
    params.sort === "overdue" || params.sort === "resolved"
      ? params.sort
      : "workload";

  const activeUsers = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.status, "A"));

  const usersFiltered = params.role
    ? activeUsers.filter((u) => u.roleName === params.role)
    : activeUsers;

  const allTickets = await db.select().from(schema.tickets);

  const pktFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" });
  const today = pktFmt.format(new Date());
  const weekAgoD = new Date();
  weekAgoD.setDate(weekAgoD.getDate() - 7);
  const weekAgo = pktFmt.format(weekAgoD);

  const workloads: UserWorkload[] = usersFiltered.map((user) => {
    const mine = allTickets.filter((t) => t.assigneeUserId === user.id);
    const active = mine.filter(
      (t) => t.status !== "RESOLVED" && t.status !== "CLOSED"
    );
    const openCount = mine.filter((t) => t.status === "OPEN").length;
    const inProgressCount = mine.filter(
      (t) => t.status === "IN_PROGRESS"
    ).length;
    const blockedCount = mine.filter((t) => t.status === "BLOCKED").length;
    const overdueCount = active.filter(
      (t) => t.dueDate && t.dueDate.slice(0, 10) < today
    ).length;
    const resolvedWeek = mine.filter(
      (t) => t.resolvedAt && t.resolvedAt >= weekAgo
    ).length;
    const totalActive = openCount + inProgressCount + blockedCount;
    const denom = resolvedWeek + totalActive;
    const completionRate = denom > 0 ? resolvedWeek / denom : 0;

    const sortedActive = [...active].sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 5;
      const pb = PRIORITY_RANK[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      const da = a.dueDate ? a.dueDate.slice(0, 10) : "9999-99-99";
      const db_ = b.dueDate ? b.dueDate.slice(0, 10) : "9999-99-99";
      return da.localeCompare(db_);
    });

    const nextDueDate = sortedActive
      .filter((t) => t.dueDate)
      .map((t) => t.dueDate!.slice(0, 10))
      .sort((a, b) => a.localeCompare(b))[0] ?? null;

    return {
      user,
      openCount,
      inProgressCount,
      blockedCount,
      overdueCount,
      resolvedWeek,
      totalActive,
      completionRate,
      nextDueDate,
      tickets: sortedActive,
    };
  });

  workloads.sort((a, b) => {
    if (sortMode === "overdue") return b.overdueCount - a.overdueCount;
    if (sortMode === "resolved") return b.resolvedWeek - a.resolvedWeek;
    return b.totalActive - a.totalActive;
  });

  const stats = {
    teamMembers: workloads.length,
    withOverdue: workloads.filter((w) => w.overdueCount > 0).length,
    totalOpen: workloads.reduce((s, w) => s + w.totalActive, 0),
    overdueTickets: workloads.reduce((s, w) => s + w.overdueCount, 0),
  };

  const fmt = new Intl.NumberFormat("en-PK");

  const roles = Array.from(
    new Set(activeUsers.map((u) => u.roleName).filter(Boolean))
  ).sort();

  const exportRows = workloads.map((w) => ({
    name: w.user.fullName,
    role: w.user.roleName,
    open: w.openCount,
    inProgress: w.inProgressCount,
    blocked: w.blockedCount,
    overdue: w.overdueCount,
    resolved7d: w.resolvedWeek,
    totalActive: w.totalActive,
    nextDeadline: w.nextDueDate ?? "",
  }));

  return (
    <Shell active="team-workload">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Team Workload</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Who is working on what — status, deadlines, completion.
            </p>
          </div>
          <ExcelExportButton
            rows={exportRows}
            columns={[
              { key: "name", label: "Name" },
              { key: "role", label: "Role" },
              { key: "open", label: "Open" },
              { key: "inProgress", label: "In Progress" },
              { key: "blocked", label: "Blocked" },
              { key: "overdue", label: "Overdue" },
              { key: "resolved7d", label: "Resolved 7d" },
              { key: "totalActive", label: "Total Active" },
              { key: "nextDeadline", label: "Next Deadline" },
            ]}
            filename="team-workload"
            sheetName="Workload"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.teamMembers)}
            </div>
            <div className="stat-label">Team Members</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.withOverdue)}
            </div>
            <div className="stat-label">With Overdue</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.totalOpen)}
            </div>
            <div className="stat-label">Total Open Tickets</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.overdueTickets)}
            </div>
            <div className="stat-label">Overdue Tickets</div>
          </div>
        </div>

        <form
          method="GET"
          action="/team/workload"
          className="border border-black p-4 mb-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label block mb-1">Role</label>
              <select
                name="role"
                className="input-box"
                defaultValue={params.role ?? ""}
              >
                <option value="">All</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Sort</label>
              <select
                name="sort"
                className="input-box"
                defaultValue={sortMode}
              >
                <option value="workload">Workload (most active)</option>
                <option value="overdue">Overdue (most overdue)</option>
                <option value="resolved">Resolved (most 7d)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/team/workload" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {workloads.map((w) => {
            const initials = getInitials(w.user.fullName);
            const nextDL = nextDeadlineText(w.nextDueDate, today);
            const shownTickets = w.tickets.slice(0, 5);
            const remaining = w.tickets.length - shownTickets.length;
            const pct = Math.round(w.completionRate * 100);
            return (
              <div key={w.user.id} className="border border-black p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="bg-black text-white flex items-center justify-center mono font-bold text-[14px]"
                    style={{ width: 40, height: 40, flexShrink: 0 }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold uppercase tracking-tight">
                      {w.user.fullName}
                    </div>
                    <div className="text-[11px] text-[var(--muted)] uppercase tracking-[0.1em]">
                      {w.user.roleName}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-px bg-black border border-black mb-4">
                  <div className="bg-white p-2 text-center">
                    <div className="mono text-[16px] font-bold">
                      {fmt.format(w.openCount)}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mt-1">
                      Open
                    </div>
                  </div>
                  <div className="bg-white p-2 text-center">
                    <div className="mono text-[16px] font-bold">
                      {fmt.format(w.inProgressCount)}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mt-1">
                      In Prog
                    </div>
                  </div>
                  <div className="bg-white p-2 text-center">
                    <div className="mono text-[16px] font-bold">
                      {fmt.format(w.blockedCount)}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mt-1">
                      Blocked
                    </div>
                  </div>
                  <div className="bg-white p-2 text-center">
                    <div
                      className={`mono text-[16px] ${w.overdueCount > 0 ? "text-black font-bold" : "font-bold"}`}
                    >
                      {fmt.format(w.overdueCount)}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mt-1">
                      Overdue
                    </div>
                  </div>
                  <div className="bg-white p-2 text-center">
                    <div className="mono text-[16px] font-bold">
                      {fmt.format(w.resolvedWeek)}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold mt-1">
                      Done 7d
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)] mb-1">
                    <span>Completion</span>
                    <span className="mono text-black">{pct}%</span>
                  </div>
                  <div
                    className="bg-gray-200 w-full"
                    style={{ height: 4 }}
                  >
                    <div
                      className="bg-black"
                      style={{ width: `${pct}%`, height: "100%" }}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)] mb-1">
                    Next Deadline
                  </div>
                  <div className={`text-[13px] mono ${nextDL.color}`}>
                    {nextDL.text}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--muted)] mb-2">
                    Active Tickets
                  </div>
                  {shownTickets.length === 0 ? (
                    <div className="text-[12px] italic text-[var(--muted)]">
                      No active tickets
                    </div>
                  ) : (
                    <div>
                      {shownTickets.map((t) => {
                        const title =
                          t.title.length > 40
                            ? t.title.slice(0, 40) + "…"
                            : t.title;
                        const due = t.dueDate
                          ? dueDiffText(t.dueDate.slice(0, 10), today)
                          : "No due";
                        const isOverdue =
                          t.dueDate && t.dueDate.slice(0, 10) < today;
                        return (
                          <a
                            key={t.id}
                            href={`/tickets/${t.id}?from=${encodeURIComponent("view=workload")}`}
                            className="no-underline block text-[12px] py-1 border-b border-[var(--border-light)] hover:bg-gray-50"
                            style={{ color: "inherit" }}
                          >
                            <span className="mono">{t.ticketNo}</span>
                            <span className="text-[var(--muted)]"> · </span>
                            <span>{title}</span>
                            <span className="text-[var(--muted)]"> · </span>
                            <span className="mono">
                              {getPriorityShort(t.priority)}
                            </span>
                            <span className="text-[var(--muted)]"> · </span>
                            <span
                              className={
                                isOverdue
                                  ? "text-[var(--danger)] font-bold mono"
                                  : "mono"
                              }
                            >
                              {due}
                            </span>
                          </a>
                        );
                      })}
                      {remaining > 0 && (
                        <div className="text-[11px] mono text-[var(--muted)] py-1">
                          +{fmt.format(remaining)} more
                        </div>
                      )}
                    </div>
                  )}
                  <a
                    href={`/tickets?assignee=${w.user.id}&view=list`}
                    className="no-underline text-[11px] uppercase tracking-[0.08em] font-semibold mt-3 inline-block border-b border-black"
                  >
                    View all in Tickets →
                  </a>
                </div>
              </div>
            );
          })}
          {workloads.length === 0 && (
            <div className="border border-black p-6 text-center text-[13px] text-[var(--muted)] lg:col-span-2">
              No team members match this filter.
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
