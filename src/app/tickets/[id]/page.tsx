import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  getStatusLabel,
  getPriorityLabel,
  getTypeLabel,
} from "../constants";

export const dynamic = "force-dynamic";

function fmt(ts: string | null | undefined): string {
  if (!ts) return "-";
  return ts.slice(0, 16).replace("T", " ");
}

function fmtDate(ts: string | null | undefined): string {
  if (!ts) return "-";
  return ts.slice(0, 10);
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const ticketId = parseInt(id, 10);
  if (!Number.isFinite(ticketId)) notFound();

  const ticketRows = await db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.id, ticketId));
  const ticket = ticketRows[0];
  if (!ticket) notFound();

  const users = await db.select().from(schema.users).orderBy(schema.users.fullName);
  const looms = await db.select().from(schema.looms).orderBy(schema.looms.loomNo);

  const comments = await db
    .select()
    .from(schema.ticketComments)
    .where(eq(schema.ticketComments.ticketId, ticketId))
    .orderBy(asc(schema.ticketComments.createdAt), asc(schema.ticketComments.id));

  const history = await db
    .select()
    .from(schema.ticketHistory)
    .where(eq(schema.ticketHistory.ticketId, ticketId))
    .orderBy(asc(schema.ticketHistory.createdAt), asc(schema.ticketHistory.id));

  const userMap = new Map(users.map((u) => [u.id, u]));
  const loomMap = new Map(looms.map((l) => [`${l.shed}|${l.loomNo}`, l]));

  const assignee = ticket.assigneeUserId ? userMap.get(ticket.assigneeUserId) : null;
  const reporter = userMap.get(ticket.reporterUserId);
  const loom = ticket.loomNo && ticket.shed ? loomMap.get(`${ticket.shed}|${ticket.loomNo}`) : null;

  async function addComment(formData: FormData) {
    "use server";
    const session = await requireSession();
    const body = (formData.get("body") as string)?.trim();
    const ticketIdStr = formData.get("ticket_id") as string;
    const tid = parseInt(ticketIdStr, 10);
    if (!body || !Number.isFinite(tid)) return;

    const [existing] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, tid)).limit(1);
    if (!existing) return;

    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.insert(schema.ticketComments).values({
        ticketId: tid,
        authorUserId: session.userId,
        body,
        createdAt: now,
      });
      await tx.insert(schema.ticketHistory).values({
        ticketId: tid,
        actorUserId: session.userId,
        action: "COMMENT_ADDED",
        fromValue: null,
        toValue: body.slice(0, 120),
        createdAt: now,
      });
      await tx
        .update(schema.tickets)
        .set({ updatedAt: now })
        .where(eq(schema.tickets.id, tid));
    });

    revalidatePath(`/tickets/${tid}`);
  }

  async function updateStatus(formData: FormData) {
    "use server";
    const session = await requireSession();
    const ticketIdStr = formData.get("ticket_id") as string;
    const tid = parseInt(ticketIdStr, 10);
    const newStatus = (formData.get("status") as string)?.trim();
    if (!newStatus || !Number.isFinite(tid)) return;
    if (!TICKET_STATUSES.some((s) => s.value === newStatus)) return;

    const rows = await db
      .select()
      .from(schema.tickets)
      .where(eq(schema.tickets.id, tid));
    const current = rows[0];
    if (!current) return;
    if (current.status === newStatus) {
      redirect(`/tickets/${tid}`);
    }

    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.tickets)
        .set({
          status: newStatus,
          updatedAt: now,
          resolvedAt: newStatus === "RESOLVED" ? now : newStatus === "CLOSED" ? current.resolvedAt : null,
        })
        .where(eq(schema.tickets.id, tid));

      await tx.insert(schema.ticketHistory).values({
        ticketId: tid,
        actorUserId: session.userId,
        action: "STATUS_CHANGE",
        fromValue: current.status,
        toValue: newStatus,
        createdAt: now,
      });
    });

    revalidatePath(`/tickets/${tid}`);
    redirect(`/tickets/${tid}`);
  }

  async function updateAssignee(formData: FormData) {
    "use server";
    const session = await requireSession();
    const ticketIdStr = formData.get("ticket_id") as string;
    const tid = parseInt(ticketIdStr, 10);
    const raw = (formData.get("assignee_user_id") as string) ?? "";
    if (!Number.isFinite(tid)) return;

    const newAssigneeId = raw === "" ? null : parseInt(raw, 10);
    if (raw !== "" && !Number.isFinite(newAssigneeId)) return;

    const rows = await db
      .select()
      .from(schema.tickets)
      .where(eq(schema.tickets.id, tid));
    const current = rows[0];
    if (!current) return;
    if ((current.assigneeUserId ?? null) === (newAssigneeId ?? null)) {
      redirect(`/tickets/${tid}`);
    }

    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.tickets)
        .set({ assigneeUserId: newAssigneeId, updatedAt: now })
        .where(eq(schema.tickets.id, tid));

      const fromLabel = current.assigneeUserId
        ? (await tx
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, current.assigneeUserId)))[0]?.fullName ?? "-"
        : "UNASSIGNED";
      const toLabel = newAssigneeId
        ? (await tx
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, newAssigneeId)))[0]?.fullName ?? "-"
        : "UNASSIGNED";

      await tx.insert(schema.ticketHistory).values({
        ticketId: tid,
        actorUserId: session.userId,
        action: "ASSIGN",
        fromValue: fromLabel,
        toValue: toLabel,
        createdAt: now,
      });
    });

    revalidatePath(`/tickets/${tid}`);
    redirect(`/tickets/${tid}`);
  }

  async function updatePriority(formData: FormData) {
    "use server";
    const session = await requireSession();
    const ticketIdStr = formData.get("ticket_id") as string;
    const tid = parseInt(ticketIdStr, 10);
    const newPriority = (formData.get("priority") as string)?.trim();
    if (!newPriority || !Number.isFinite(tid)) return;

    const rows = await db
      .select()
      .from(schema.tickets)
      .where(eq(schema.tickets.id, tid));
    const current = rows[0];
    if (!current) return;
    if (current.priority === newPriority) {
      redirect(`/tickets/${tid}`);
    }

    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.tickets)
        .set({ priority: newPriority, updatedAt: now })
        .where(eq(schema.tickets.id, tid));

      await tx.insert(schema.ticketHistory).values({
        ticketId: tid,
        actorUserId: session.userId,
        action: "PRIORITY_CHANGE",
        fromValue: current.priority,
        toValue: newPriority,
        createdAt: now,
      });
    });

    revalidatePath(`/tickets/${tid}`);
    redirect(`/tickets/${tid}`);
  }

  async function deleteTicket(formData: FormData) {
    "use server";
    await requireSession();
    const ticketIdStr = formData.get("ticket_id") as string;
    const tid = parseInt(ticketIdStr, 10);
    if (!Number.isFinite(tid)) return;

    await db.transaction(async (tx) => {
      await tx
        .delete(schema.ticketComments)
        .where(eq(schema.ticketComments.ticketId, tid));
      await tx
        .delete(schema.ticketHistory)
        .where(eq(schema.ticketHistory.ticketId, tid));
      await tx.delete(schema.tickets).where(eq(schema.tickets.id, tid));
    });

    revalidatePath("/tickets");
    redirect("/tickets");
  }

  const statusChipCls =
    "bg-black text-white px-3 py-1 mono text-[11px] uppercase tracking-[0.1em] inline-block";
  const priorityChipCls =
    "bg-black text-white px-3 py-1 mono text-[11px] uppercase tracking-[0.1em] inline-block";
  const typeChipCls =
    "border border-black px-3 py-1 mono text-[11px] uppercase tracking-[0.1em] inline-block";

  return (
    <Shell active="tickets">
      <div className="animate-in">
        <div className="flex items-center gap-4 mb-6">
          <a href={from ? `/tickets?${decodeURIComponent(from)}` : "/tickets"} className="btn btn-outline btn-sm">Back</a>
          <div className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
            Tickets &middot; {ticket.ticketNo}
          </div>
        </div>

        <div className="mb-4">
          <h1 className="page-title">{ticket.title}</h1>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          <span className={statusChipCls}>{getStatusLabel(ticket.status)}</span>
          <span className={priorityChipCls}>{getPriorityLabel(ticket.priority)}</span>
          <span className={typeChipCls}>{getTypeLabel(ticket.type)}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="border border-black p-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
                Description
              </div>
              <div className="text-[13px] whitespace-pre-wrap">
                {ticket.description?.trim() ? ticket.description : "-"}
              </div>
            </div>

            <div className="border border-black p-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
                Comments ({comments.length})
              </div>

              {comments.length === 0 ? (
                <div className="text-[13px] text-[var(--muted)] mb-4">No comments yet.</div>
              ) : (
                <div className="flex flex-col gap-3 mb-6">
                  {comments.map((c) => {
                    const author = userMap.get(c.authorUserId);
                    return (
                      <div key={c.id} className="border border-black p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                            {(author?.fullName ?? "Unknown").toUpperCase()}
                          </div>
                          <div className="mono text-[11px] text-[var(--muted)]">
                            {fmt(c.createdAt)}
                          </div>
                        </div>
                        <div className="text-[13px] whitespace-pre-wrap">{c.body}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <form action={addComment}>
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <label className="label block mb-1">Add Comment</label>
                <textarea
                  name="body"
                  rows={4}
                  className="input-box w-full mb-3"
                  placeholder="Write a comment..."
                  required
                />
                <button type="submit" className="btn btn-sm">Post Comment</button>
              </form>
            </div>

            <div className="border border-black p-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
                Activity
              </div>
              {history.length === 0 ? (
                <div className="text-[13px] text-[var(--muted)]">No activity yet.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {history.map((h) => {
                    const actor = userMap.get(h.actorUserId);
                    const actorName = (actor?.fullName ?? "Unknown").toUpperCase();
                    let description = "";
                    switch (h.action) {
                      case "CREATED":
                        description = "created this ticket";
                        break;
                      case "STATUS_CHANGE":
                        description = `changed status from ${getStatusLabel(h.fromValue)} to ${getStatusLabel(h.toValue)}`;
                        break;
                      case "ASSIGN":
                        description = `reassigned from ${h.fromValue ?? "-"} to ${h.toValue ?? "-"}`;
                        break;
                      case "PRIORITY_CHANGE":
                        description = `changed priority from ${getPriorityLabel(h.fromValue)} to ${getPriorityLabel(h.toValue)}`;
                        break;
                      case "COMMENT_ADDED":
                        description = "added a comment";
                        break;
                      default:
                        description = h.action.toLowerCase().replace(/_/g, " ");
                    }
                    return (
                      <div
                        key={h.id}
                        className="border-l-2 border-black pl-4 py-1"
                      >
                        <div className="mono text-[11px] text-[var(--muted)] uppercase tracking-[0.05em]">
                          {fmt(h.createdAt)} &middot; {actorName}
                        </div>
                        <div className="text-[13px]">{description}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="border border-black p-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
                Details
              </div>
              <dl className="text-[13px]">
                <DetailRow
                  label="Assignee"
                  value={
                    assignee
                      ? assignee.fullName.toUpperCase()
                      : ticket.assigneeUserId
                      ? `USER #${ticket.assigneeUserId} (DELETED)`
                      : "UNASSIGNED"
                  }
                />
                <DetailRow
                  label="Reporter"
                  value={reporter ? reporter.fullName.toUpperCase() : "-"}
                />
                <DetailRow label="Created" value={fmt(ticket.createdAt)} mono />
                <DetailRow label="Updated" value={fmt(ticket.updatedAt)} mono />
                <DetailRow label="Due Date" value={fmtDate(ticket.dueDate)} mono />
                <DetailRow label="Resolved" value={fmt(ticket.resolvedAt)} mono />
                <DetailRow
                  label="Loom"
                  value={
                    loom
                      ? `${loom.loomNo} (${loom.shed})`
                      : ticket.loomNo
                      ? String(ticket.loomNo)
                      : "-"
                  }
                  mono
                />
                <DetailRow label="Contract" value={ticket.contractNo ?? "-"} mono />
                <DetailRow label="Party" value={ticket.partyCode ?? "-"} mono />
                <DetailRow label="Grey Code" value={ticket.greyCode ?? "-"} mono />
                <DetailRow label="Beam No" value={ticket.beamNo ?? "-"} mono />
                <DetailRow label="Labels" value={ticket.labels ?? "-"} />
              </dl>
            </div>

            <div className="border border-black p-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
                Actions
              </div>

              <form action={updateStatus} className="mb-4">
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <label className="label block mb-1">Status</label>
                <div className="flex gap-2">
                  <select
                    name="status"
                    className="input-box flex-1"
                    defaultValue={ticket.status}
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn-sm">Update</button>
                </div>
              </form>

              <form action={updateAssignee} className="mb-4">
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <label className="label block mb-1">Assignee</label>
                <div className="flex gap-2">
                  <select
                    name="assignee_user_id"
                    className="input-box flex-1"
                    defaultValue={ticket.assigneeUserId ?? ""}
                  >
                    <option value="">Unassigned</option>
                    {ticket.assigneeUserId != null && !users.some((u) => u.id === ticket.assigneeUserId) && (
                      <option value={ticket.assigneeUserId} disabled>
                        USER #{ticket.assigneeUserId} (deleted)
                      </option>
                    )}
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn-sm">Update</button>
                </div>
              </form>

              <form action={updatePriority}>
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <label className="label block mb-1">Priority</label>
                <div className="flex gap-2">
                  <select
                    name="priority"
                    className="input-box flex-1"
                    defaultValue={ticket.priority}
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn-sm">Update</button>
                </div>
              </form>
            </div>

            <div className="border border-black p-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
                Danger Zone
              </div>
              <form action={deleteTicket}>
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <button type="submit" className="btn btn-outline btn-sm">
                  Delete Ticket
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-2 border-b border-gray-100 last:border-b-0">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className={mono ? "mono text-[12px]" : "text-[13px]"}>{value}</dd>
    </div>
  );
}
