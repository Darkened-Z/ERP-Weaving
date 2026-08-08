import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function YarnFibersPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
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
  }

  async function remove(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!id || Number.isNaN(id)) return;
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
                  {selected && (
                    <form action={remove} className="inline">
                      <input type="hidden" name="id" value={selected.id} />
                      <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                    </form>
                  )}
                </div>
              </div>

              <form action={save}>
                {selected && <input type="hidden" name="id" value={selected.id} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
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
                  <div className="sm:col-span-2">
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
                    return (
                      <tr
                        key={f.id}
                        className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                      >
                        <td className="mono font-bold">
                          <a
                            href={`/define/yarn-fibers?id=${f.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {f.code}
                          </a>
                        </td>
                        <td>
                          <a
                            href={`/define/yarn-fibers?id=${f.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {f.type ?? "-"}
                          </a>
                        </td>
                        <td>{f.description}</td>
                        <td className="mono">{f.denier ?? "-"}</td>
                        <td className="mono">{f.length ?? "-"}</td>
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
