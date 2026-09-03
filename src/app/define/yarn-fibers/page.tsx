import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUniqueViolation } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

export default async function YarnFibersPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const fibers = await db
    .select()
    .from(schema.yarnFibers)
    .orderBy(schema.yarnFibers.code);

  const selected = params.id
    ? fibers.find((f) => String(f.id) === params.id) ?? null
    : null;

  async function save(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const code = parseInt(formData.get("code") as string, 10);
    const description = (formData.get("description") as string)?.trim();
    if (!code || Number.isNaN(code) || !description) return;
    const type = (formData.get("type") as string)?.trim() || null;
    const denier = (formData.get("denier") as string)?.trim() || null;
    const length = (formData.get("length") as string)?.trim() || null;

    try {
      if (id) {
        const parsedId = parseInt(id, 10);
        if (Number.isNaN(parsedId)) return;
        await db
          .update(schema.yarnFibers)
          .set({ code, type, description, denier, length })
          .where(eq(schema.yarnFibers.id, parsedId));
        revalidatePath("/define/yarn-fibers");
        redirect(`/define/yarn-fibers?id=${parsedId}`);
      } else {
        const [row] = await db
          .insert(schema.yarnFibers)
          .values({ code, type, description, denier, length })
          .returning({ id: schema.yarnFibers.id });
        revalidatePath("/define/yarn-fibers");
        redirect(`/define/yarn-fibers?id=${row.id}`);
      }
    } catch (e) {
      if (isUniqueViolation(e)) redirect(`/define/yarn-fibers?${id ? `id=${id}&` : ""}error=exists`);
      throw e;
    }
  }

  async function remove(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!id || Number.isNaN(id)) return;

    const [row] = await db
      .select({ description: schema.yarnFibers.description, type: schema.yarnFibers.type })
      .from(schema.yarnFibers)
      .where(eq(schema.yarnFibers.id, id))
      .limit(1);
    if (!row) redirect("/define/yarn-fibers");

    // yarnCounts.type holds the fibre/blend name (COTTON, POLYESTER, etc.).
    // Guard against either the fibre's `type` or `description` being referenced.
    const [ycByDesc] = await db
      .select({ id: schema.yarnCounts.id })
      .from(schema.yarnCounts)
      .where(eq(schema.yarnCounts.type, row.description))
      .limit(1);
    const ycByType = row.type
      ? (
          await db
            .select({ id: schema.yarnCounts.id })
            .from(schema.yarnCounts)
            .where(eq(schema.yarnCounts.type, row.type))
            .limit(1)
        )[0]
      : null;

    if (ycByDesc || ycByType) {
      redirect(`/define/yarn-fibers?id=${id}&error=in_use`);
    }

    await db
      .delete(schema.yarnFibers)
      .where(eq(schema.yarnFibers.id, id));
    revalidatePath("/define/yarn-fibers");
    redirect("/define/yarn-fibers");
  }

  return (
    <Shell active="yarn-fibers">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Yarn Fiber{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({fibers.length})
            </span>
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="border border-black p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {selected ? "Edit Record" : "New Record"}
                </div>
                <div className="flex gap-2">
                  <a href="/define/yarn-fibers" className="btn btn-outline btn-sm">New</a>
                  {selected ? (
                    <form action={remove} className="inline">
                      <input type="hidden" name="id" value={selected.id} />
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

              {params.error === "in_use" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  This fiber is referenced by yarn counts and cannot be deleted.
                </div>
              )}
              {params.error === "exists" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  That code already exists.
                </div>
              )}
              <form action={save}>
                {selected && <input type="hidden" name="id" value={selected.id} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 gform">
                  <div>
                    <label className="label block mb-1">Code</label>
                    <input
                      name="code"
                      type="number"
                      className="input-box mono"
                      defaultValue={selected?.code ?? ""}
                      required
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Type</label>
                    <input
                      name="type"
                      className="input-box"
                      defaultValue={selected?.type ?? ""}
                    />
                  </div>
                  <div className="sm:col-span-2 gform-full">
                    <label className="label block mb-1">Description</label>
                    <input
                      name="description"
                      className="input-box"
                      defaultValue={selected?.description ?? ""}
                      required
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Denier</label>
                    <input
                      name="denier"
                      className="input-box mono"
                      defaultValue={selected?.denier ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Length</label>
                    <input
                      name="length"
                      className="input-box mono"
                      defaultValue={selected?.length ?? ""}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/define/yarn-fibers" className="btn btn-outline btn-sm">Cancel</a>
                </div>
              </form>
            </div>
          </div>

          <div>
            <div className="overflow-x-auto" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Denier</th>
                    <th>Length</th>
                  </tr>
                </thead>
                <tbody>
                  {fibers.map((f) => {
                    const isSelected = selected?.id === f.id;
                    const href = `/define/yarn-fibers?id=${f.id}`;
                    const style = { color: isSelected ? "white" : "inherit" };
                    return (
                      <tr
                        key={f.id}
                        className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                      >
                        <td className="p-0 mono font-bold"><a href={href} className="no-underline block px-2 py-1" style={style}>{f.code}</a></td>
                        <td className="p-0"><a href={href} className="no-underline block px-2 py-1" style={style}>{f.type ?? "-"}</a></td>
                        <td className="p-0"><a href={href} className="no-underline block px-2 py-1" style={style}>{f.description}</a></td>
                        <td className="p-0 mono"><a href={href} className="no-underline block px-2 py-1" style={style}>{f.denier ?? "-"}</a></td>
                        <td className="p-0 mono"><a href={href} className="no-underline block px-2 py-1" style={style}>{f.length ?? "-"}</a></td>
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
