import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BeamStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const statuses = await db.select().from(schema.beamStatuses);

  const selected = params.id
    ? statuses.find((s) => s.id === Number(params.id)) ?? null
    : null;

  async function saveStatus(formData: FormData) {
    "use server";
    const status = (formData.get("status") as string)?.trim();
    if (!status) return;

    const editId = formData.get("id") as string;

    if (editId) {
      await db
        .update(schema.beamStatuses)
        .set({ status })
        .where(eq(schema.beamStatuses.id, Number(editId)));
    } else {
      await db.insert(schema.beamStatuses).values({ status });
    }

    revalidatePath("/define/beam-status");
    redirect("/define/beam-status");
  }

  async function deleteStatus(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (!id) return;
    const numId = Number(id);

    const [row] = await db
      .select({ status: schema.beamStatuses.status })
      .from(schema.beamStatuses)
      .where(eq(schema.beamStatuses.id, numId))
      .limit(1);
    if (!row) redirect("/define/beam-status");

    const [beamRef] = await db
      .select({ id: schema.beams.id })
      .from(schema.beams)
      .where(eq(schema.beams.statusWrk, row.status))
      .limit(1);

    if (beamRef) {
      redirect(`/define/beam-status?id=${id}&error=in_use`);
    }

    await db
      .delete(schema.beamStatuses)
      .where(eq(schema.beamStatuses.id, numId));
    revalidatePath("/define/beam-status");
    redirect("/define/beam-status");
  }

  return (
    <Shell active="beam-status">
      <div className="animate-in">
        <h1 className="page-title mb-8">Beam Status</h1>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {selected ? "Edit Status" : "New Status"}
            </div>
            <div className="flex gap-2">
              <a href="/define/beam-status" className="btn btn-outline btn-sm">New</a>
              {selected && (
                <form action={deleteStatus} className="inline">
                  <input type="hidden" name="id" value={selected.id} />
                  <ConfirmButton>Delete</ConfirmButton>
                </form>
              )}
            </div>
          </div>

          {params.error === "in_use" && (
            <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
              This beam status is currently assigned to beams and cannot be deleted.
            </div>
          )}
          <form action={saveStatus}>
            {selected && <input type="hidden" name="id" value={selected.id} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <label className="label block mb-1">Status</label>
                <input
                  name="status"
                  className="input-box"
                  defaultValue={selected?.status ?? ""}
                  required
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button type="submit" className="btn btn-sm">Save</button>
            </div>
          </form>
        </div>

        <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((s, i) => {
                const isSelected = s.id === selected?.id;
                return (
                  <tr
                    key={s.id}
                    className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px]">
                      <a
                        href={`/define/beam-status?id=${s.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {i + 1}
                      </a>
                    </td>
                    <td>
                      <a
                        href={`/define/beam-status?id=${s.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {s.status}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
