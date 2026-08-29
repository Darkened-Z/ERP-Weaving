import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  STATUS_ORDER,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  getPriorityChipClass,
  getPriorityLabel,
  getPriorityShort,
  getStatusLabel,
  getTypeLabel,
  getTypeShort,
} from "./constants";

export const dynamic = "force-dynamic";

type SP = {
  view?: string;
  status?: string;
  type?: string;
  priority?: string;
  assignee?: string;
  loom?: string;
  q?: string;
};

function buildQuery(params: SP, override: Partial<SP>): string {
  const merged: Record<string, string | undefined> = { ...params, ...override };
  const qs = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== "" && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "board";

  const currentQS = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "" && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  const fromParam = currentQS ? `?from=${encodeURIComponent(currentQS)}` : "";

  const users = await db.select().from(schema.users);

  const conditions = [];
  if (params.status) conditions.push(eq(schema.tickets.status, params.status));
  if (params.type) conditions.push(eq(schema.tickets.type, params.type));
  if (params.priority) conditions.push(eq(schema.tickets.priority, params.priority));
  if (params.assignee) {
    const asId = parseInt(params.assignee, 10);
    if (Number.isFinite(asId)) conditions.push(eq(schema.tickets.assigneeUserId, asId));
  }
  if (params.loom) {
    const lm = parseInt(params.loom, 10);
    if (Number.isFinite(lm)) conditions.push(eq(schema.tickets.loomNo, lm));
  }
  if (params.q) {
    const escQ = params.q.replace(/[\\%_]/g, (m) => "\\" + m);
    const pat = `%${escQ}%`;
    const orCond = or(
      sql`${schema.tickets.title} LIKE ${pat} ESCAPE '\\'`,
      sql`${schema.tickets.description} LIKE ${pat} ESCAPE '\\'`,
      sql`${schema.tickets.ticketNo} LIKE ${pat} ESCAPE '\\'`
    );
    if (orCond) conditions.push(orCond);
  }

  const tickets = conditions.length
    ? await db
        .select()
        .from(schema.tickets)
        .where(and(...conditions))
        .orderBy(desc(schema.tickets.createdAt))
    : await db
        .select()
        .from(schema.tickets)
        .orderBy(desc(schema.tickets.createdAt));

  const userById = new Map(users.map((u) => [u.id, u]));

  const pktFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" });
  const today = pktFmt.format(new Date());
  const weekAgoDate = new Date();
  weekAgoDate.setDate(weekAgoDate.getDate() - 7);
  const weekAgo = pktFmt.format(weekAgoDate);

  const stats = {
    open: tickets.filter((t) => t.status === "OPEN").length,
    inProgress: tickets.filter((t) => t.status === "IN_PROGRESS").length,
    overdue: tickets.filter(
      (t) =>
        t.dueDate &&
        t.dueDate < today &&
        t.status !== "RESOLVED" &&
        t.status !== "CLOSED"
    ).length,
    resolvedThisWeek: tickets.filter(
      (t) => t.resolvedAt && t.resolvedAt >= weekAgo
    ).length,
  };

  const fmt = new Intl.NumberFormat("en-PK");

  const exportRows = tickets.map((t) => ({
    ticketNo: t.ticketNo,
    title: t.title,
    type: getTypeLabel(t.type),
    priority: getPriorityLabel(t.priority),
    status: getStatusLabel(t.status),
    loom: t.loomNo != null ? (t.shed ? `Shed ${t.shed} · ${t.loomNo}` : String(t.loomNo)) : "",
    created: t.createdAt ? t.createdAt.slice(0, 10) : "",
  }));

  return (
    <Shell active="tickets">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Tickets</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2 mono">
              {fmt.format(tickets.length)} tickets
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ExcelExportButton
              rows={exportRows}
              columns={[
                { key: "ticketNo", label: "Ticket #" },
                { key: "title", label: "Title" },
                { key: "type", label: "Type" },
                { key: "priority", label: "Priority" },
                { key: "status", label: "Status" },
                { key: "loom", label: "Loom" },
                { key: "created", label: "Created" },
              ]}
              filename="tickets"
              sheetName="Tickets"
            />
            <div className="flex border border-black">
              <a
                href={`/tickets${buildQuery(params, { view: "board" })}`}
                className="no-underline px-3 py-1 text-[11px] uppercase tracking-[0.1em] font-semibold"
                style={{
                  background: view === "board" ? "black" : "transparent",
                  color: view === "board" ? "white" : "black",
                }}
              >
                Board
              </a>
              <a
                href={`/tickets${buildQuery(params, { view: "list" })}`}
                className="no-underline px-3 py-1 text-[11px] uppercase tracking-[0.1em] font-semibold border-l border-black"
                style={{
                  background: view === "list" ? "black" : "transparent",
                  color: view === "list" ? "white" : "black",
                }}
              >
                List
              </a>
            </div>
            <a href="/tickets/new" className="btn btn-sm">
              New Ticket
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt.format(stats.open)}</div>
            <div className="stat-label">Open</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.inProgress)}
            </div>
            <div className="stat-label">In Progress</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.overdue)}
            </div>
            <div className="stat-label">Overdue</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(stats.resolvedThisWeek)}
            </div>
            <div className="stat-label">Resolved 7d</div>
          </div>
        </div>

        <form
          method="GET"
          action="/tickets"
          className="border border-black p-4 mb-6"
        >
          <input type="hidden" name="view" value={view} />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
            <div>
              <label className="label block mb-1">Type</label>
              <select
                name="type"
                className="input-box"
                defaultValue={params.type ?? ""}
              >
                <option value="">All</option>
                {TICKET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Priority</label>
              <select
                name="priority"
                className="input-box"
                defaultValue={params.priority ?? ""}
              >
                <option value="">All</option>
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Assignee</label>
              <select
                name="assignee"
                className="input-box"
                defaultValue={params.assignee ?? ""}
              >
                <option value="">All</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Loom #</label>
              <input
                name="loom"
                className="input-box mono"
                defaultValue={params.loom ?? ""}
                placeholder="e.g. 14"
              />
            </div>
            <div>
              <label className="label block mb-1">Search</label>
              <input
                name="q"
                className="input-box"
                defaultValue={params.q ?? ""}
                placeholder="Title, description, #"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href={`/tickets?view=${view}`} className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        {view === "board" ? (
          <div className="overflow-x-auto">
            <div className="flex gap-3" style={{ minWidth: "1000px" }}>
              {STATUS_ORDER.map((statusVal) => {
                const colTickets = tickets.filter((t) => t.status === statusVal);
                const statusLabel = getStatusLabel(statusVal);
                return (
                  <div
                    key={statusVal}
                    className="flex-1 border border-black bg-gray-50"
                    style={{ minWidth: "220px" }}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-black bg-white">
                      <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                        {statusLabel}
                      </div>
                      <div className="mono text-[11px] font-bold">
                        {fmt.format(colTickets.length)}
                      </div>
                    </div>
                    <div
                      className="p-2"
                      style={{ maxHeight: "70vh", overflowY: "auto" }}
                    >
                      {colTickets.map((t) => (
                        <a
                          key={t.id}
                          href={`/tickets/${t.id}${fromParam}`}
                          className="no-underline block border border-black p-3 mb-2 bg-white cursor-pointer hover:bg-gray-50"
                          style={{ color: "inherit" }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="mono text-[10px] text-[var(--muted)]">
                              {t.ticketNo}
                            </span>
                            <span
                              className={`mono text-[10px] px-1.5 py-0.5 ${getPriorityChipClass(t.priority)}`}
                            >
                              {getPriorityShort(t.priority)}
                            </span>
                          </div>
                          <div className="text-[13px] font-bold leading-tight mb-2">
                            {t.title}
                          </div>
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                            <span>{getTypeShort(t.type)}</span>
                            {t.loomNo !== null && t.loomNo !== undefined && (
                              <span className="mono">
                                {t.shed ? `Shed ${t.shed} · ` : ""}Loom #{fmt.format(t.loomNo)}
                              </span>
                            )}
                          </div>
                        </a>
                      ))}
                      {colTickets.length === 0 && (
                        <div className="text-[11px] text-[var(--muted)] text-center py-4">
                          No tickets
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Loom</th>
                  <th>Assignee</th>
                  <th>Created</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const rowHref = `/tickets/${t.id}${fromParam}`;
                  const linkStyle = { color: "inherit" };
                  const assignee = t.assigneeUserId
                    ? userById.get(t.assigneeUserId)?.fullName ?? "-"
                    : "-";
                  return (
                    <tr key={t.id} className="cursor-pointer hover:bg-gray-50">
                      <td className="mono text-[12px] p-0">
                        <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                          {t.ticketNo}
                        </a>
                      </td>
                      <td className="text-[13px] p-0">
                        <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                          {t.title}
                        </a>
                      </td>
                      <td className="text-[12px] p-0">
                        <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                          {getTypeLabel(t.type)}
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
                          {t.loomNo !== null && t.loomNo !== undefined
                            ? (t.shed ? `Shed ${t.shed} · #${fmt.format(t.loomNo)}` : `#${fmt.format(t.loomNo)}`)
                            : "-"}
                        </a>
                      </td>
                      <td className="text-[12px] p-0">
                        <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                          {assignee}
                        </a>
                      </td>
                      <td className="mono text-[12px] text-[var(--muted)] p-0">
                        <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                          {t.createdAt ? t.createdAt.slice(0, 10) : "-"}
                        </a>
                      </td>
                      <td className="mono text-[12px] p-0">
                        <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                          {t.dueDate ?? "-"}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {tickets.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-center text-[12px] text-[var(--muted)] py-6"
                    >
                      No tickets found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
