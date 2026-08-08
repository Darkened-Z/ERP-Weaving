import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WeaversPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const weavers = await db
    .select()
    .from(schema.weavers)
    .orderBy(schema.weavers.code);

  const selected = params.id
    ? weavers.find((w) => String(w.id) === params.id) ?? null
    : null;

  async function save(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const code = parseInt(formData.get("code") as string);
    const name = (formData.get("name") as string)?.trim();
    if (!code || !name) return;
    const nameShort = (formData.get("nameShort") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const cell = (formData.get("cell") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;

    if (id) {
      await db
        .update(schema.weavers)
        .set({ code, name, nameShort, address, cell, phone })
        .where(eq(schema.weavers.id, parseInt(id)));
      revalidatePath("/define/weavers");
      redirect(`/define/weavers?id=${id}`);
    } else {
      const [row] = await db
        .insert(schema.weavers)
        .values({ code, name, nameShort, address, cell, phone })
        .returning();
      revalidatePath("/define/weavers");
      redirect(`/define/weavers?id=${row.id}`);
    }
  }

  async function remove(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (!id) return;
    await db
      .delete(schema.weavers)
      .where(eq(schema.weavers.id, parseInt(id)));
    revalidatePath("/define/weavers");
    redirect("/define/weavers");
  }

  return (
    <Shell active="weavers">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Weavers{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({weavers.length})
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
                  <a href="/define/weavers" className="btn btn-outline btn-sm">New</a>
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
                    <label className="label block mb-1">Name</label>
                    <input
                      name="name"
                      className="input-box"
                      defaultValue={selected?.name ?? ""}
                      required
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Short Name</label>
                    <input
                      name="nameShort"
                      className="input-box"
                      defaultValue={selected?.nameShort ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Address</label>
                    <input
                      name="address"
                      className="input-box"
                      defaultValue={selected?.address ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Cell No</label>
                    <input
                      name="cell"
                      className="input-box mono"
                      defaultValue={selected?.cell ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Phone</label>
                    <input
                      name="phone"
                      className="input-box mono"
                      defaultValue={selected?.phone ?? ""}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/define/weavers" className="btn btn-outline btn-sm">Cancel</a>
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
                    <th>Name</th>
                    <th>Short Name</th>
                    <th>Cell No</th>
                    <th>Phone</th>
                    <th>Address</th>
                  </tr>
                </thead>
                <tbody>
                  {weavers.map((w) => {
                    const isSelected = selected?.id === w.id;
                    return (
                      <tr
                        key={w.id}
                        className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                      >
                        <td className="mono text-[13px]">
                          <a
                            href={`/define/weavers?id=${w.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {w.code}
                          </a>
                        </td>
                        <td>
                          <a
                            href={`/define/weavers?id=${w.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {w.name}
                          </a>
                        </td>
                        <td>{w.nameShort || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                        <td className="mono text-[13px]">{w.cell || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                        <td className="mono text-[13px]">{w.phone || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                        <td>{w.address || <span className="text-[var(--muted)]">&mdash;</span>}</td>
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
