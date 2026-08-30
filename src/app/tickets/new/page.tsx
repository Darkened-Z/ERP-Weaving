import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import {
  TICKET_PRIORITIES,
  TICKET_TYPES,
} from "../constants";

export const dynamic = "force-dynamic";

type SP = {
  loom?: string;
  contract?: string;
  party?: string;
  grey?: string;
  beam?: string;
};

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const params = await searchParams;
  await requireSession();

  const users = await db.select().from(schema.users);
  const looms = await db.select().from(schema.looms);
  const greyConstructions = await db.select().from(schema.greyConstruction);

  const [convContracts, purContracts, salContracts, coaParties] = await Promise.all([
    db.select({ no: schema.extGreyConvContract.contNo }).from(schema.extGreyConvContract),
    db.select({ no: schema.extGreyPurContract.contractNo }).from(schema.extGreyPurContract),
    db.select({ no: schema.extGreySalContract.contractNo }).from(schema.extGreySalContract),
    db
      .select({
        code: schema.chartOfAccounts.code,
        description: schema.chartOfAccounts.description,
        level: schema.chartOfAccounts.level,
      })
      .from(schema.chartOfAccounts),
  ]);

  const contractOptions = Array.from(
    new Set(
      [...convContracts, ...purContracts, ...salContracts]
        .map((r) => r.no)
        .filter((v): v is string => !!v)
    )
  )
    .sort()
    .map((no) => ({ value: no, label: no }));

  const partyOptions = coaParties
    .filter((a) => (a.level ?? 0) >= 4)
    .map((a) => ({ value: a.code, label: `${a.code} — ${a.description}`, desc: a.description }))
    .sort((a, b) => a.value.localeCompare(b.value));

  async function createTicket(formData: FormData) {
    "use server";
    const session = await requireSession();

    const title = (formData.get("title") as string)?.trim();
    const type = (formData.get("type") as string)?.trim();
    if (!title || !type) return;
    if (!TICKET_TYPES.some((t) => t.value === type)) return;

    const priority = (formData.get("priority") as string)?.trim() || "P3_NORMAL";
    if (!TICKET_PRIORITIES.some((p) => p.value === priority)) return;
    const description = (formData.get("description") as string)?.trim() || null;
    const assigneeRaw = (formData.get("assignee_user_id") as string)?.trim();
    const assigneeUserId = assigneeRaw ? parseInt(assigneeRaw, 10) : null;
    const safeAssignee = Number.isFinite(assigneeUserId) ? assigneeUserId : null;
    const loomRaw = (formData.get("loom_no") as string)?.trim();
    let parsedShed: string | null = null;
    let loomNumStr = loomRaw;
    if (loomRaw && loomRaw.includes("|")) {
      const [s, l] = loomRaw.split("|");
      parsedShed = s || null;
      loomNumStr = l ?? "";
    }
    const loomNo = loomNumStr ? parseInt(loomNumStr, 10) : null;
    const safeLoomNo = Number.isFinite(loomNo) ? loomNo : null;
    const contractNo = (formData.get("contract_no") as string)?.trim() || null;
    const partyCode = (formData.get("party_code") as string)?.trim() || null;
    const greyCode = (formData.get("grey_code") as string)?.trim() || null;
    const beamNo = (formData.get("beam_no") as string)?.trim() || null;
    const dueDate = (formData.get("due_date") as string)?.trim() || null;
    const labels = (formData.get("labels") as string)?.trim() || null;

    const now = new Date().toISOString();

    const values = {
      title,
      description,
      type,
      priority,
      status: "OPEN" as const,
      assigneeUserId: safeAssignee,
      reporterUserId: session.userId,
      shed: parsedShed,
      loomNo: safeLoomNo,
      contractNo,
      partyCode,
      greyCode,
      beamNo,
      labels,
      dueDate,
      createdAt: now,
      updatedAt: now,
    };

    async function insertTicket(): Promise<{ id: number }> {
      return db.transaction(async (tx) => {
        const [{ maxNum }] = await tx
          .select({
            maxNum: sql<number>`coalesce(max(CAST(SUBSTR(ticket_no, 5) AS INTEGER)), 0)`,
          })
          .from(schema.tickets);
        const ticketNo = `TKT-${String(maxNum + 1).padStart(5, "0")}`;

        const [row] = await tx
          .insert(schema.tickets)
          .values({ ticketNo, ...values })
          .returning({ id: schema.tickets.id });

        await tx.insert(schema.ticketHistory).values({
          ticketId: row.id,
          actorUserId: session.userId,
          action: "CREATED",
          fromValue: null,
          toValue: "OPEN",
          createdAt: now,
        });

        return row;
      });
    }

    let inserted!: { id: number };
    try {
      inserted = await insertTicket();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("SQLITE_CONSTRAINT_UNIQUE")) {
        inserted = await insertTicket();
      } else {
        throw err;
      }
    }

    revalidatePath("/tickets");
    redirect(`/tickets/${inserted.id}`);
  }

  return (
    <Shell active="tickets">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">New Ticket</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Report an issue, defect, or maintenance need
            </p>
          </div>
          <a href="/tickets" className="btn btn-outline btn-sm">
            Cancel
          </a>
        </div>

        <form action={createTicket} className="border border-black p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="md:col-span-2">
              <label className="label block mb-1">Title *</label>
              <input
                name="title"
                className="input-box"
                required
                placeholder="Short summary of the issue"
              />
            </div>

            <div>
              <label className="label block mb-1">Type *</label>
              <select name="type" className="input-box" required defaultValue="">
                <option value="" disabled>
                  -- Select Type --
                </option>
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
                defaultValue="P3_NORMAL"
              >
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label block mb-1">Description</label>
              <textarea
                name="description"
                className="input-box"
                rows={4}
                placeholder="What happened? Include any relevant details."
              />
            </div>

            <div>
              <label className="label block mb-1">Assignee</label>
              <select name="assignee_user_id" className="input-box" defaultValue="">
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.roleName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label block mb-1">Loom #</label>
              <select
                name="loom_no"
                className="input-box mono"
                defaultValue={params.loom ?? ""}
              >
                <option value="">--</option>
                {looms.map((l) => (
                  <option key={l.id} value={`${l.shed}|${l.loomNo}`}>
                    Shed {l.shed} · Loom #{l.loomNo} ({l.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label block mb-1">Contract #</label>
              <Combobox
                name="contract_no"
                options={contractOptions}
                defaultValue={params.contract ?? ""}
                placeholder="Contract #"
              />
            </div>

            <div>
              <label className="label block mb-1">Party Code</label>
              <Combobox
                name="party_code"
                options={partyOptions}
                defaultValue={params.party ?? ""}
                placeholder="Party Code"
              />
            </div>

            <div>
              <label className="label block mb-1">Grey Code</label>
              <select
                name="grey_code"
                className="input-box mono"
                defaultValue={params.grey ?? ""}
              >
                <option value="">--</option>
                {greyConstructions.map((g) => (
                  <option key={g.id} value={g.code}>
                    {g.code} - {g.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label block mb-1">Beam No</label>
              <input
                name="beam_no"
                className="input-box mono"
                defaultValue={params.beam ?? ""}
              />
            </div>

            <div>
              <label className="label block mb-1">Due Date</label>
              <input name="due_date" type="date" className="input-box mono" />
            </div>

            <div className="md:col-span-2">
              <label className="label block mb-1">Labels</label>
              <input
                name="labels"
                className="input-box"
                placeholder="comma,separated,labels"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button type="submit" className="btn btn-sm">
              Create Ticket
            </button>
            <a href="/tickets" className="btn btn-outline btn-sm">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </Shell>
  );
}
