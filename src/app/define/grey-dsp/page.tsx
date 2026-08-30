import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GreyDspPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const parties = await db
    .select()
    .from(schema.greyDspChart)
    .orderBy(schema.greyDspChart.code);

  const selected = params.id
    ? parties.find((p) => String(p.id) === params.id) ?? null
    : null;

  async function save(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const code = parseInt(formData.get("code") as string);
    const name = (formData.get("name") as string)?.trim();
    if (!code || !name) return;
    const nameShort = (formData.get("nameShort") as string)?.trim() || null;
    const cell = (formData.get("cell") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;

    if (id) {
      await db
        .update(schema.greyDspChart)
        .set({ code, name, nameShort, cell, phone })
        .where(eq(schema.greyDspChart.id, parseInt(id)));
      revalidatePath("/define/grey-dsp");
      redirect(`/define/grey-dsp?id=${id}`);
    } else {
      const [row] = await db
        .insert(schema.greyDspChart)
        .values({ code, name, nameShort, cell, phone })
        .returning();
      revalidatePath("/define/grey-dsp");
      redirect(`/define/grey-dsp?id=${row.id}`);
    }
  }

  async function remove(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (!id) return;
    const numId = parseInt(id);

    const [row] = await db
      .select({ name: schema.greyDspChart.name })
      .from(schema.greyDspChart)
      .where(eq(schema.greyDspChart.id, numId))
      .limit(1);
    if (!row) redirect("/define/grey-dsp");
    const name = row.name;

    const [gdRef] = await db
      .select({ id: schema.greyDespatch.id })
      .from(schema.greyDespatch)
      .where(eq(schema.greyDespatch.party, name))
      .limit(1);
    const [intGdRef] = await db
      .select({ id: schema.intGreyDespatch.id })
      .from(schema.intGreyDespatch)
      .where(eq(schema.intGreyDespatch.party, name))
      .limit(1);
    const [kpRef] = await db
      .select({ id: schema.extKachiParchi.id })
      .from(schema.extKachiParchi)
      .where(eq(schema.extKachiParchi.purchaseParty, name))
      .limit(1);
    const [ppRef] = await db
      .select({ id: schema.extPackiParchi.id })
      .from(schema.extPackiParchi)
      .where(eq(schema.extPackiParchi.purchaseParty, name))
      .limit(1);

    if (gdRef || intGdRef || kpRef || ppRef) {
      redirect(`/define/grey-dsp?id=${id}&error=in_use`);
    }

    await db
      .delete(schema.greyDspChart)
      .where(eq(schema.greyDspChart.id, numId));
    revalidatePath("/define/grey-dsp");
    redirect("/define/grey-dsp");
  }

  return (
    <Shell active="grey-dsp">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Grey Despatch Chart{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({parties.length})
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
                  <a href="/define/grey-dsp" className="btn btn-outline btn-sm">New</a>
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
                  This party is referenced by grey despatch, kachi parchi, or packi parchi records and cannot be deleted.
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
                  <a href="/define/grey-dsp" className="btn btn-outline btn-sm">Cancel</a>
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
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => {
                    const isSelected = selected?.id === p.id;
                    const href = `/define/grey-dsp?id=${p.id}`;
                    const style = { color: isSelected ? "white" : "inherit" };
                    const dash = <span className="text-[var(--muted)]">&mdash;</span>;
                    return (
                      <tr
                        key={p.id}
                        className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                      >
                        <td className="p-0 mono text-[13px]"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.code}</a></td>
                        <td className="p-0"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.name}</a></td>
                        <td className="p-0"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.nameShort || dash}</a></td>
                        <td className="p-0 mono text-[13px]"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.cell || dash}</a></td>
                        <td className="p-0 mono text-[13px]"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.phone || dash}</a></td>
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
