import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GreyLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string }>;
}) {
  const params = await searchParams;
  const allLocations = await db.select().from(schema.locations).where(eq(schema.locations.type, "GREY")).orderBy(schema.locations.code);

  const paramId = params.id ? parseInt(params.id, 10) : NaN;
  const selected = Number.isNaN(paramId)
    ? null
    : allLocations.find((l) => l.id === paramId) ?? null;
  const isAdding = params.adding === "1";
  const formItem = isAdding ? null : selected;

  async function saveLocation(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const code = parseInt(formData.get("code") as string, 10);
    const description = (formData.get("description") as string)?.trim();
    if (!code || Number.isNaN(code) || !description) return;

    if (id) {
      const parsedId = parseInt(id, 10);
      if (Number.isNaN(parsedId)) return;
      await db.update(schema.locations).set({ code, description, type: "GREY" }).where(eq(schema.locations.id, parsedId));
      revalidatePath("/define/locations");
      redirect(`/define/locations?id=${parsedId}`);
    } else {
      const [row] = await db
        .insert(schema.locations)
        .values({ code, description, type: "GREY" })
        .returning({ id: schema.locations.id });
      revalidatePath("/define/locations");
      redirect(`/define/locations?id=${row.id}`);
    }
  }

  async function deleteLocation(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!id || Number.isNaN(id)) return;
    await db.delete(schema.locations).where(eq(schema.locations.id, id));
    revalidatePath("/define/locations");
    redirect("/define/locations");
  }

  return (
    <Shell active="locations-grey">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Grey Despatch Parties Location{" "}
            <span className="text-[var(--muted)] text-lg font-normal">({allLocations.length})</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="border border-black p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding ? "New Location" : formItem ? "Edit Location" : "Location Details"}
                </div>
                <div className="flex gap-2">
                  <a href="/define/locations?adding=1" className="btn btn-outline btn-sm">New</a>
                  {formItem && (
                    <form action={deleteLocation} className="inline">
                      <input type="hidden" name="id" value={formItem.id} />
                      <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                    </form>
                  )}
                </div>
              </div>
              <form action={saveLocation}>
                {formItem && <input type="hidden" name="id" value={formItem.id} />}
                <div className="grid grid-cols-1 gap-y-3 gform">
                  <div>
                    <label className="label block mb-1">Code</label>
                    <input name="code" type="number" className="input-box mono" defaultValue={formItem?.code ?? ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Description</label>
                    <input name="description" className="input-box" defaultValue={formItem?.description ?? ""} required />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/define/locations" className="btn btn-outline btn-sm">Exit</a>
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
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {allLocations.map((l) => {
                    const isSel = l.id === selected?.id;
                    const rowHref = `/define/locations?id=${l.id}`;
                    const linkStyle = { color: isSel ? "white" : "inherit" };
                    return (
                      <tr key={l.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td className="mono text-[13px] p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {l.code}
                          </a>
                        </td>
                        <td className="p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {l.description}
                          </a>
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
