import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const cities = await db.select().from(schema.cities);

  const selected = params.id
    ? cities.find((c) => c.id === Number(params.id)) ?? null
    : null;

  async function saveCity(formData: FormData) {
    "use server";
    const name = (formData.get("name") as string)?.trim();
    if (!name) return;

    const editId = formData.get("id") as string;

    if (editId) {
      await db
        .update(schema.cities)
        .set({ name })
        .where(eq(schema.cities.id, Number(editId)));
    } else {
      await db.insert(schema.cities).values({ name });
    }

    revalidatePath("/define/cities");
    redirect("/define/cities");
  }

  async function deleteCity(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (!id) return;
    await db.delete(schema.cities).where(eq(schema.cities.id, Number(id)));
    revalidatePath("/define/cities");
    redirect("/define/cities");
  }

  return (
    <Shell active="cities">
      <div className="animate-in">
        <h1 className="page-title mb-8">Area-Cities</h1>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {selected ? "Edit City" : "New City"}
            </div>
            <div className="flex gap-2">
              <a href="/define/cities" className="btn btn-outline btn-sm">New</a>
              {selected && (
                <form action={deleteCity} className="inline">
                  <input type="hidden" name="id" value={selected.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
            </div>
          </div>

          <form action={saveCity}>
            {selected && <input type="hidden" name="id" value={selected.id} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <label className="label block mb-1">City Name</label>
                <input
                  name="name"
                  className="input-box"
                  defaultValue={selected?.name ?? ""}
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
                <th>City Name</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c, i) => {
                const isSelected = c.id === selected?.id;
                return (
                  <tr
                    key={c.id}
                    className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px]">
                      <a
                        href={`/define/cities?id=${c.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {i + 1}
                      </a>
                    </td>
                    <td>
                      <a
                        href={`/define/cities?id=${c.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {c.name}
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
