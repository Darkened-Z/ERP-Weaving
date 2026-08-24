import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
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
  const blends = await db.select().from(schema.yarnBlends);
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

    const type = (formData.get("blend") as string)?.trim() || "COTTON";
    const status = (formData.get("status") as string)?.trim() || "A";

    const existing = await db.select().from(schema.yarnCounts);
    const ownId = id ? parseInt(id) : null;
    const dup = existing.some(
      (c) =>
        c.id !== ownId &&
        c.description.trim().toLowerCase() === description.toLowerCase() &&
        c.type === type
    );
    if (dup) {
      redirect("/define/yarn-counts?" + (id ? `id=${id}&` : "adding=1&") + "error=dup_desc_blend");
    }

    if (id) {
      // code is locked — never changed after creation
      await db.update(schema.yarnCounts).set({
        description, type, status,
      }).where(eq(schema.yarnCounts.id, parseInt(id)));
    } else {
      const nextN = existing.reduce((m, r) => {
        const n = parseInt(r.countCode ?? "", 10);
        return Number.isFinite(n) && n > m ? n : m;
      }, 0) + 1;
      await db.insert(schema.yarnCounts).values({
        countCode: String(nextN), description, type, status,
      });
    }
    revalidatePath("/define/yarn-counts");
    redirect("/define/yarn-counts" + (id ? `?id=${id}` : ""));
  }

  async function deleteCount(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    if (!id) return;
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
                  {formItem && (
                    <form action={deleteCount} className="inline">
                      <input type="hidden" name="id" value={formItem.id} />
                      <ConfirmButton>Delete</ConfirmButton>
                    </form>
                  )}
                </div>
              </div>

              {params.error === "dup_desc_blend" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  A count with this description and blend already exists.
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
                    <label className="label block mb-1">Blend</label>
                    <select name="blend" className="input-box" defaultValue={formItem?.type ?? ""}>
                      <option value="">--</option>
                      {blends.map((b) => (
                        <option key={b.id} value={b.description}>{b.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select name="status" className="input-box" defaultValue={formItem?.status ?? "A"}>
                      <option value="A">A</option>
                      <option value="R">R</option>
                      <option value="C">C</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Password</label>
                    <input type="password" name="pswd" className="input-box mono" tabIndex={-1} />
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
                    return (
                      <tr key={c.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td>
                          <a href={`/define/yarn-counts?id=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="no-underline" style={{ color: isSel ? "white" : "inherit" }}>
                            {c.description}
                          </a>
                        </td>
                        <td>{c.type ?? "-"}</td>
                        <td className="mono text-[13px]">{c.countCode}</td>
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
