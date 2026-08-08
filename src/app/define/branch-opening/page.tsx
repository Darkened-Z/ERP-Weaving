import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BranchOpeningPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const branches = await db
    .select()
    .from(schema.branchOpening)
    .orderBy(schema.branchOpening.openingDate);

  const selected = params.id
    ? branches.find((b) => String(b.id) === params.id) ?? null
    : null;

  async function save(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const branchCode = (formData.get("branchCode") as string)?.trim();
    const branchName = (formData.get("branchName") as string)?.trim();
    const fyCode = (formData.get("fyCode") as string)?.trim();
    const openingDate = (formData.get("openingDate") as string)?.trim();
    if (!branchCode || !branchName || !fyCode || !openingDate) return;
    const address = (formData.get("address") as string)?.trim() || null;
    const city = (formData.get("city") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;
    const status = (formData.get("status") as string)?.trim() || "A";

    if (id) {
      await db
        .update(schema.branchOpening)
        .set({ branchCode, branchName, address, city, phone, fyCode, openingDate, status })
        .where(eq(schema.branchOpening.id, parseInt(id)));
      revalidatePath("/define/branch-opening");
      redirect(`/define/branch-opening?id=${id}`);
    } else {
      const [row] = await db
        .insert(schema.branchOpening)
        .values({ branchCode, branchName, address, city, phone, fyCode, openingDate, status })
        .returning();
      revalidatePath("/define/branch-opening");
      redirect(`/define/branch-opening?id=${row.id}`);
    }
  }

  async function remove(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (!id) return;
    await db
      .delete(schema.branchOpening)
      .where(eq(schema.branchOpening.id, parseInt(id)));
    revalidatePath("/define/branch-opening");
    redirect("/define/branch-opening");
  }

  return (
    <Shell active="branch-opening">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            New Branch Opening{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({branches.length})
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
                  <a href="/define/branch-opening" className="btn btn-outline btn-sm">New</a>
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
                    <label className="label block mb-1">Branch Code</label>
                    <input
                      name="branchCode"
                      className="input-box mono"
                      defaultValue={selected?.branchCode ?? ""}
                      required
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Branch Name</label>
                    <input
                      name="branchName"
                      className="input-box"
                      defaultValue={selected?.branchName ?? ""}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label block mb-1">Address</label>
                    <input
                      name="address"
                      className="input-box"
                      defaultValue={selected?.address ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">City</label>
                    <input
                      name="city"
                      className="input-box"
                      defaultValue={selected?.city ?? ""}
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
                    <label className="label block mb-1">FY Code</label>
                    <input
                      name="fyCode"
                      className="input-box mono"
                      defaultValue={selected?.fyCode ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Opening Date</label>
                    <input
                      name="openingDate"
                      className="input-box mono"
                      defaultValue={selected?.openingDate ?? ""}
                      placeholder="YYYY-MM-DD"
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
                      <option value="C">C - Closed</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/define/branch-opening" className="btn btn-outline btn-sm">Cancel</a>
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
                    <th>Branch Name</th>
                    <th>Address</th>
                    <th>City</th>
                    <th>Phone</th>
                    <th>FY Code</th>
                    <th>Opening Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => {
                    const isSelected = selected?.id === b.id;
                    return (
                      <tr
                        key={b.id}
                        className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                      >
                        <td className="mono font-bold">
                          <a
                            href={`/define/branch-opening?id=${b.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {b.branchCode}
                          </a>
                        </td>
                        <td>
                          <a
                            href={`/define/branch-opening?id=${b.id}`}
                            className="no-underline"
                            style={{ color: isSelected ? "white" : "inherit" }}
                          >
                            {b.branchName}
                          </a>
                        </td>
                        <td className="text-[13px]">{b.address ?? "-"}</td>
                        <td>{b.city ?? "-"}</td>
                        <td className="mono text-[13px]">{b.phone ?? "-"}</td>
                        <td className="mono text-[13px]">{b.fyCode}</td>
                        <td className="mono text-[13px]">{b.openingDate}</td>
                        <td>
                          <span
                            className="inline-block px-2 py-0.5 text-[11px] font-bold uppercase"
                            style={{
                              background: isSelected
                                ? "white"
                                : b.status === "A" ? "black" : "transparent",
                              color: isSelected
                                ? "black"
                                : b.status === "A" ? "white" : "black",
                              border: "1px solid black",
                            }}
                          >
                            {b.status === "A" ? "ACTIVE" : "CLOSED"}
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
