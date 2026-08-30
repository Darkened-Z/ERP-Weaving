import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function YarnCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; q?: string; error?: string }>;
}) {
  const params = await searchParams;
  const counts = await db.select().from(schema.yarnCounts).orderBy(schema.yarnCounts.countCode);
  const nextCode = String(
    counts.reduce((max, c) => {
      const n = parseInt(c.countCode ?? "", 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1
  );

  const selected = params.id
    ? counts.find((c) => c.id === parseInt(params.id!)) ?? null
    : null;
  const isAdding = params.adding === "1";
  const formItem = isAdding ? null : selected;

  const q = (params.q ?? "").trim();
  const ql = q.toLowerCase();
  const listed = !q
    ? counts
    : counts.filter(
        (c) =>
          (c.countCode ?? "").toLowerCase().includes(ql) ||
          c.description.toLowerCase().includes(ql)
      );

  async function saveCount(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const description = (formData.get("desc") as string)?.trim();
    if (!description) return;

    const status = (formData.get("status") as string)?.trim() || "A";
    const blend = (formData.get("blend") as string)?.trim() || null;

    const existing = await db.select().from(schema.yarnCounts);
    const ownId = id ? parseInt(id) : null;
    const dup = existing.some(
      (c) =>
        c.id !== ownId &&
        c.description.trim().toLowerCase() === description.toLowerCase()
    );
    if (dup) {
      redirect("/define/yarn-counts?" + (id ? `id=${id}&` : "adding=1&") + "error=dup_desc");
    }

    if (id) {
      // code is locked — never changed after creation
      await db.update(schema.yarnCounts).set({
        description, status, ...(blend != null ? { type: blend } : {}),
      }).where(eq(schema.yarnCounts.id, parseInt(id)));
    } else {
      const nextN = existing.reduce((m, r) => {
        const n = parseInt(r.countCode ?? "", 10);
        return Number.isFinite(n) && n > m ? n : m;
      }, 0) + 1;
      await db.insert(schema.yarnCounts).values({
        countCode: String(nextN), description, status, type: blend ?? "COTTON",
      });
    }
    revalidatePath("/define/yarn-counts");
    redirect("/define/yarn-counts" + (id ? `?id=${id}` : ""));
  }

  async function deleteCount(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    if (!id) return;

    const [row] = await db
      .select({ countCode: schema.yarnCounts.countCode, id: schema.yarnCounts.id })
      .from(schema.yarnCounts)
      .where(eq(schema.yarnCounts.id, id))
      .limit(1);
    if (!row) redirect("/define/yarn-counts");
    const code = row.countCode;
    const codeN = parseInt(code, 10);

    const [purCon] = await db
      .select({ id: schema.extYarnPurContract.id })
      .from(schema.extYarnPurContract)
      .where(eq(schema.extYarnPurContract.countCode, code))
      .limit(1);
    const [salCon] = await db
      .select({ id: schema.extYarnSalContract.id })
      .from(schema.extYarnSalContract)
      .where(eq(schema.extYarnSalContract.countCode, code))
      .limit(1);
    const pcRef = Number.isFinite(codeN)
      ? (
          await db
            .select({ id: schema.partyCounts.id })
            .from(schema.partyCounts)
            .where(eq(schema.partyCounts.countCode, codeN))
            .limit(1)
        )[0]
      : null;
    const [extWarp] = await db
      .select({ id: schema.extGreyConvWarp.id })
      .from(schema.extGreyConvWarp)
      .where(eq(schema.extGreyConvWarp.count, code))
      .limit(1);
    const [extWeft] = await db
      .select({ id: schema.extGreyConvWeft.id })
      .from(schema.extGreyConvWeft)
      .where(eq(schema.extGreyConvWeft.count, code))
      .limit(1);
    const [intWarp] = await db
      .select({ id: schema.intGreyConversionWarp.id })
      .from(schema.intGreyConversionWarp)
      .where(eq(schema.intGreyConversionWarp.count, code))
      .limit(1);
    const [intWeft] = await db
      .select({ id: schema.intGreyConversionWeft.id })
      .from(schema.intGreyConversionWeft)
      .where(eq(schema.intGreyConversionWeft.count, code))
      .limit(1);
    const [purVL] = await db
      .select({ id: schema.extYarnPurVoucherLine.id })
      .from(schema.extYarnPurVoucherLine)
      .where(
        or(
          eq(schema.extYarnPurVoucherLine.count, code),
          eq(schema.extYarnPurVoucherLine.partyCount, code),
        ),
      )
      .limit(1);
    const [salVL] = await db
      .select({ id: schema.extYarnSalVoucherLine.id })
      .from(schema.extYarnSalVoucherLine)
      .where(eq(schema.extYarnSalVoucherLine.count, code))
      .limit(1);

    if (purCon || salCon || pcRef || extWarp || extWeft || intWarp || intWeft || purVL || salVL) {
      redirect(`/define/yarn-counts?id=${id}&error=in_use`);
    }

    await db.delete(schema.yarnCounts).where(eq(schema.yarnCounts.id, id));
    revalidatePath("/define/yarn-counts");
    redirect("/define/yarn-counts");
  }

  return (
    <Shell active="yarn-counts">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Yarn Count (WVG){" "}
            <span className="text-[var(--muted)] text-lg font-normal">({counts.length})</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="border border-black p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding ? "New Count" : formItem ? "Edit Count" : "Count Details"}
                </div>
                <div className="flex gap-2">
                  <a href="/define/yarn-counts?adding=1" className="btn btn-outline btn-sm">New</a>
                  {formItem ? (
                    <form action={deleteCount} className="inline">
                      <input type="hidden" name="id" value={formItem.id} />
                      <ConfirmButton>Delete</ConfirmButton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled
                      title="Save the record first to enable delete"
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {params.error === "dup_desc" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  A count with this description already exists.
                </div>
              )}
              {params.error === "in_use" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  This yarn count is referenced by contracts, party counts, or voucher lines and cannot be deleted.
                </div>
              )}
              <form action={saveCount}>
                {formItem && <input type="hidden" name="id" value={formItem.id} />}
                <div className="grid grid-cols-1 gap-y-3">
                  <div>
                    <label className="label block mb-1">Code</label>
                    <input name="code" className="input-box mono bg-gray-100" value={formItem?.countCode ?? nextCode} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="label block mb-1">Code Desc</label>
                    <input name="desc" className="input-box" defaultValue={formItem?.description ?? ""} required autoFocus />
                  </div>
                  <div>
                    <label className="label block mb-1">Blend / Ratio <span className="text-[10px] text-[var(--muted)]">(e.g. PV 65:35 — appears after count in line items)</span></label>
                    <input name="blend" className="input-box mono" defaultValue={formItem?.type ?? ""} placeholder="PV 65:35" />
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select name="status" className="input-box" defaultValue={formItem?.status ?? "A"}>
                      <option value="A">A</option>
                      <option value="R">R</option>
                      <option value="C">C</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/define/yarn-counts" className="btn btn-outline btn-sm">Exit</a>
                </div>
              </form>
            </div>
          </div>

          <div>
            <form method="get" className="flex items-center gap-2 mb-3">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
              <input name="q" defaultValue={q} className="input-box flex-1 text-[13px]" placeholder="Search by Desc or Code..." />
              <button type="submit" className="btn btn-outline btn-sm">Find</button>
              {q && <a href="/define/yarn-counts" className="btn btn-outline btn-sm">Clear</a>}
            </form>
            <div className="overflow-x-auto" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Desc</th>
                    <th>Blend</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((c) => {
                    const isSel = c.id === selected?.id;
                    const href = `/define/yarn-counts?id=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
                    const style = { color: isSel ? "white" : "inherit" };
                    return (
                      <tr key={c.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td className="p-0"><a href={href} className="no-underline block px-2 py-1" style={style}>{c.description}</a></td>
                        <td className="p-0 mono text-[13px]"><a href={href} className="no-underline block px-2 py-1" style={style}>{c.type ?? "-"}</a></td>
                        <td className="p-0 mono text-[13px]"><a href={href} className="no-underline block px-2 py-1" style={style}>{c.countCode}</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
