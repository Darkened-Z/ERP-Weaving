import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const staff = await db
    .select()
    .from(schema.productionStaff)
    .orderBy(schema.productionStaff.code);

  const selected = params.id
    ? staff.find((s) => String(s.id) === params.id) ?? null
    : null;

  async function save(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const code = parseInt(formData.get("code") as string);
    const name = (formData.get("name") as string)?.trim();
    if (!code || !name) return;
    const level = parseInt(formData.get("level") as string) || 1;
    const nameShort = (formData.get("nameShort") as string)?.trim() || null;
    const cell = (formData.get("cell") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;
    const shed = parseInt(formData.get("shed") as string) || null;
    const shift = (formData.get("shift") as string)?.trim() || null;
    const status = (formData.get("status") as string)?.trim() || "A";

    if (id) {
      await db
        .update(schema.productionStaff)
        .set({ code, level, name, nameShort, cell, phone, shed, shift, status })
        .where(eq(schema.productionStaff.id, parseInt(id)));
      revalidatePath("/define/staff");
      redirect(`/define/staff?id=${id}`);
    } else {
      const [row] = await db
        .insert(schema.productionStaff)
        .values({ code, level, name, nameShort, cell, phone, shed, shift, status })
        .returning();
      revalidatePath("/define/staff");
      redirect(`/define/staff?id=${row.id}`);
    }
  }

  async function remove(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (!id) return;
    const numId = parseInt(id);

    const [row] = await db
      .select({ name: schema.productionStaff.name, nameShort: schema.productionStaff.nameShort })
      .from(schema.productionStaff)
      .where(eq(schema.productionStaff.id, numId))
      .limit(1);
    if (!row) redirect("/define/staff");
    const name = row.name;

    const [dpRef] = await db
      .select({ id: schema.dailyProduction.id })
      .from(schema.dailyProduction)
      .where(eq(schema.dailyProduction.shiftIncharge, name))
      .limit(1);
    const [intDpRef] = await db
      .select({ id: schema.intDailyProduction.id })
      .from(schema.intDailyProduction)
      .where(
        or(
          eq(schema.intDailyProduction.shiftInchargeTm, name),
          eq(schema.intDailyProduction.shiftInchargePm, name),
          eq(schema.intDailyProduction.shiftInchargeA, name),
          eq(schema.intDailyProduction.shiftInchargeB, name),
          eq(schema.intDailyProduction.shiftInchargeC, name),
        ),
      )
      .limit(1);

    if (dpRef || intDpRef) {
      redirect(`/define/staff?id=${id}&error=in_use`);
    }

    await db
      .delete(schema.productionStaff)
      .where(eq(schema.productionStaff.id, numId));
    revalidatePath("/define/staff");
    redirect("/define/staff");
  }

  return (
    <Shell active="staff">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Production Staff{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({staff.length})
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
                  <a href="/define/staff" className="btn btn-outline btn-sm">New</a>
                  {selected && (
                    <form action={remove} className="inline">
                      <input type="hidden" name="id" value={selected.id} />
                      <ConfirmButton>Delete</ConfirmButton>
                    </form>
                  )}
                </div>
              </div>

              {params.error === "in_use" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  This staff member is referenced by daily production shift-incharge fields and cannot be deleted.
                </div>
              )}
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
                    <label className="label block mb-1">Level</label>
                    <input
                      name="level"
                      type="number"
                      className="input-box mono"
                      defaultValue={selected?.level ?? 1}
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
                  <div>
                    <label className="label block mb-1">Shed</label>
                    <input
                      name="shed"
                      type="number"
                      className="input-box mono"
                      defaultValue={selected?.shed ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Shift</label>
                    <input
                      name="shift"
                      className="input-box"
                      defaultValue={selected?.shift ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select
                      name="status"
                      className="input-box"
                      defaultValue={selected?.status ?? "A"}
                    >
                      <option value="A">A - Active</option>
                      <option value="S">S - Suspended</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/define/staff" className="btn btn-outline btn-sm">Cancel</a>
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
                    <th>Level</th>
                    <th>Name</th>
                    <th>Short Name</th>
                    <th>Cell No</th>
                    <th>Phone</th>
                    <th>Shed</th>
                    <th>Shift</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => {
                    const isSelected = selected?.id === s.id;
                    return (
                      <tr
                        key={s.id}
                        className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                      >
                        <td className="mono text-[13px]">
                          <a
                            href={`/define/staff?id=${s.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {s.code}
                          </a>
                        </td>
                        <td className="mono text-[13px]">
                          <a
                            href={`/define/staff?id=${s.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {s.level}
                          </a>
                        </td>
                        <td>
                          <a
                            href={`/define/staff?id=${s.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {s.name}
                          </a>
                        </td>
                        <td>{s.nameShort || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                        <td className="mono text-[13px]">{s.cell || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                        <td className="mono text-[13px]">{s.phone || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                        <td className="mono text-[13px]">{s.shed ?? <span className="text-[var(--muted)]">&mdash;</span>}</td>
                        <td>{s.shift || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                        <td>
                          <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase"
                            style={{
                              background: isSelected ? "white" : s.status === "A" ? "black" : "transparent",
                              color: isSelected ? "black" : s.status === "A" ? "white" : "black",
                            }}
                          >
                            {s.status}
                          </span>
                        </td>
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
