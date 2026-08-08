import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function YarnCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string }>;
}) {
  const params = await searchParams;
  const counts = await db.select().from(schema.yarnCounts).orderBy(schema.yarnCounts.countCode);
  const blends = await db.select().from(schema.yarnBlends);

  const selected = params.id
    ? counts.find((c) => c.id === parseInt(params.id!)) ?? null
    : null;
  const isAdding = params.adding === "1";
  const formItem = isAdding ? null : selected;

  async function saveCount(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const description = (formData.get("desc") as string)?.trim();
    const countCode = (formData.get("code") as string)?.trim();
    if (!description || !countCode) return;

    const type = (formData.get("blend") as string)?.trim() || "COTTON";
    const status = (formData.get("status") as string)?.trim() || "A";

    if (id) {
      await db.update(schema.yarnCounts).set({
        countCode, description, type, status,
      }).where(eq(schema.yarnCounts.id, parseInt(id)));
    } else {
      await db.insert(schema.yarnCounts).values({
        countCode, description, type, status,
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
                      <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                    </form>
                  )}
                </div>
              </div>

              <form action={saveCount}>
                {formItem && <input type="hidden" name="id" value={formItem.id} />}
                <div className="grid grid-cols-1 gap-y-3">
                  <div>
                    <label className="label block mb-1">Desc</label>
                    <input name="desc" className="input-box" defaultValue={formItem?.description ?? ""} required />
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
                    <label className="label block mb-1">Code</label>
                    <input name="code" className="input-box mono" defaultValue={formItem?.countCode ?? ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select name="status" className="input-box" defaultValue={formItem?.status ?? "R"}>
                      <option value="R">R</option>
                      <option value="A">A</option>
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
            <div className="flex items-center gap-2 mb-3">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
              <input className="input-box flex-1 text-[13px]" placeholder="Search by Desc or Code..." />
            </div>
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
                  {counts.map((c) => {
                    const isSel = c.id === selected?.id;
                    return (
                      <tr key={c.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td>
                          <a href={`/define/yarn-counts?id=${c.id}`} className="no-underline" style={{ color: isSel ? "white" : "inherit" }}>
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
