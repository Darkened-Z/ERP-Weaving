import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import {
  TICKET_STATUSES,
  getPriorityChipClass,
  getPriorityShort,
  getStatusLabel,
  getTypeShort,
} from "../tickets/constants";

export const dynamic = "force-dynamic";

type SP = {
  view?: string;
  status?: string;
};

const PRIORITY_RANK: Record<string, number> = {
  P1_URGENT: 1,
  P2_HIGH: 2,
  P3_NORMAL: 3,
  P4_LOW: 4,
};

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((n) => parseInt(n, 10));
  const [by, bm, bd] = b.split("-").map((n) => parseInt(n, 10));
  const da = Date.UTC(ay, am - 1, ad);
  const db_ = Date.UTC(by, bm - 1, bd);
  return Math.round((da - db_) / 86400000);
}

function dueLabel(dueDate: string | null, today: string): {
  text: string;
  color: string;
} {
  if (!dueDate) return { text: "—", color: "text-[var(--muted)]" };
  const d = dueDate.slice(0, 10);
  const diff = daysBetween(d, today);
  if (diff < 0)
    return {
      text: `OVERDUE by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"}`,
      color: "text-[var(--danger)] font-bold",
    };
  if (diff === 0) return { text: "Today", color: "font-bold" };
  return {
    text: `${diff} day${diff === 1 ? "" : "s"} left`,
    color: "text-black",
  };
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const view = params.view === "reported" ? "reported" : "assigned";

  const assignedAll = await db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.assigneeUserId, session.userId));

  const reportedAll = await db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.reporterUserId, session.userId));

  const pktFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" });
  const today = pktFmt.format(new Date());
  const weekAgoD = new Date();
  weekAgoD.setDate(weekAgoD.getDate() - 7);
  const weekAgo = pktFmt.format(weekAgoD);

  const stats = {
    open: assignedAll.filter((t) => t.status === "OPEN").length,
    inProgress: assignedAll.filter((t) => t.status === "IN_PROGRESS").length,
    overdue: assignedAll.filter(
      (t) =>
        t.dueDate &&
        t.dueDate.slice(0, 10) < today &&
        t.status !== "RESOLVED" &&
        t.status !== "CLOSED"
    ).length,
    resolvedWeek: assignedAll.filter(
      (t) => t.resolvedAt && t.resolvedAt >= weekAgo
    ).length,
  };

  const base = view === "assigned" ? assignedAll : reportedAll;
  const filtered = params.status
    ? base.filter((t) => t.status === params.status)
    : base;

  const sorted = [...filtered].sort((a, b) => {
    const aOverdue =
      a.dueDate &&
      a.dueDate.slice(0, 10) < today &&
      a.status !== "RESOLVED" &&
      a.status !== "CLOSED"
        ? 0
        : 1;
    const bOverdue =
      b.dueDate &&
      b.dueDate.slice(0, 10) < today &&
      b.status !== "RESOLVED" &&
      b.status !== "CLOSED"
        ? 0
        : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const pa = PRIORITY_RANK[a.priority] ?? 5;
    const pb = PRIORITY_RANK[b.priority] ?? 5;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate ? a.dueDate.slice(0, 10) : "9999-99-99";
    const db_ = b.dueDate ? b.dueDate.slice(0, 10) : "9999-99-99";
    return da.localeCompare(db_);
  });

  const fmt = new Intl.NumberFormat("en-PK");
  const currentQS = `view=${view}${params.status ? `&status=${encodeURIComponent(params.status)}` : ""}`;
  const fromParam = `?from=${encodeURIComponent(currentQS)}`;

  return (
    <Shell active="my-tasks">
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="page-title">My Tasks · {session.fullName}</h1>
          <p className="text-[12px] text-[var(--muted)] mt-2 uppercase tracking-[0.1em]">
            {session.roleName}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt.format(stats.open)}</div>
            <div className="stat-label">My Open</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.inProgress)}
            </div>
            <div className="stat-label">My In Progress</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.overdue)}
            </div>
            <div className="stat-label">My Overdue</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.resolvedWeek)}
            </div>
            <div className="stat-label">My Resolved 7d</div>
          </div>
        </div>

        <div className="flex border border-black mb-6">
          <a
            href={`/my-tasks?view=assigned${params.status ? `&status=${encodeURIComponent(params.status)}` : ""}`}
            className="no-underline px-4 py-2 text-[11px] uppercase tracking-[0.1em] font-semibold flex-1 text-center"
            style={{
              background: view === "assigned" ? "black" : "transparent",
              color: view === "assigned" ? "white" : "black",
            }}
          >
            Assigned to Me ({fmt.format(assignedAll.length)})
          </a>
          <a
            href={`/my-tasks?view=reported${params.status ? `&status=${encodeURIComponent(params.status)}` : ""}`}
            className="no-underline px-4 py-2 text-[11px] uppercase tracking-[0.1em] font-semibold flex-1 text-center border-l border-black"
            style={{
              background: view === "reported" ? "black" : "transparent",
              color: view === "reported" ? "white" : "black",
            }}
          >
            Reported by Me ({fmt.format(reportedAll.length)})
          </a>
        </div>

        <form
          method="GET"
          action="/my-tasks"
          className="border border-black p-4 mb-6"
        >
          <input type="hidden" name="view" value={view} />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="label block mb-1">Status</label>
              <select
                name="status"
                className="input-box"
                defaultValue={params.status ?? ""}
              >
                <option value="">All</option>
                {TICKET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href={`/my-tasks?view=${view}`} className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Ticket #</th>
                <th>Title</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Days Left</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const due = dueLabel(t.dueDate ?? null, today);
                const rowHref = `/tickets/${t.id}${fromParam}`;
                const linkStyle = { color: "inherit" };
                return (
                  <tr key={t.id} className="cursor-pointer hover:bg-gray-50">
                    <td className="mono text-[12px] p-0">
                      <a
                        href={rowHref}
                        className="no-underline block px-2 py-1"
                        style={linkStyle}
                      >
                        {t.ticketNo}
                      </a>
                    </td>
                    <td className="text-[13px] p-0">
                      <a
                        href={rowHref}
                        className="no-underline block px-2 py-1"
                        style={linkStyle}
                      >
                        {t.title}
                      </a>
                    </td>
                    <td className="text-[12px] p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {getTypeShort(t.type)}
                      </a>
                    </td>
                    <td className="p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        <span
                          className={`mono text-[10px] px-1.5 py-0.5 ${getPriorityChipClass(t.priority)}`}
                        >
                          {getPriorityShort(t.priority)}
                        </span>
                      </a>
                    </td>
                    <td className="text-[12px] p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {getStatusLabel(t.status)}
                      </a>
                    </td>
                    <td className="mono text-[12px] p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {t.dueDate ? t.dueDate.slice(0, 10) : "—"}
                      </a>
                    </td>
                    <td className={`text-[12px] p-0 ${due.color}`}>
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {due.text}
                      </a>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-[12px] text-[var(--muted)] py-6"
                  >
                    No tasks in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
