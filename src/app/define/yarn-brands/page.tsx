import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function YarnBrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; find?: string; error?: string }>;
}) {
  const params = await searchParams;
  const allBrands = await db
    .select()
    .from(schema.yarnBrands)
    .orderBy(schema.yarnBrands.name);

  const brands = params.find
    ? allBrands.filter((b) =>
        b.name.toLowerCase().includes(params.find!.toLowerCase())
      )
    : allBrands;

  const selected = params.id
    ? allBrands.find((b) => b.id === Number(params.id)) ?? null
    : null;

  async function saveBrand(formData: FormData) {
    "use server";
    const name = (formData.get("name") as string)?.trim();
    if (!name) return;

    const editId = formData.get("id") as string;

    if (editId) {
      await db
        .update(schema.yarnBrands)
        .set({ name })
        .where(eq(schema.yarnBrands.id, Number(editId)));
    } else {
      await db.insert(schema.yarnBrands).values({ name });
    }

    revalidatePath("/define/yarn-brands");
    redirect("/define/yarn-brands");
  }

  async function deleteBrand(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (!id) return;
    const numId = Number(id);

    const [row] = await db
      .select({ name: schema.yarnBrands.name })
      .from(schema.yarnBrands)
      .where(eq(schema.yarnBrands.id, numId))
      .limit(1);
    if (!row) redirect("/define/yarn-brands");
    const brand = row.name;

    const [purCon] = await db
      .select({ id: schema.extYarnPurContract.id })
      .from(schema.extYarnPurContract)
      .where(eq(schema.extYarnPurContract.brand, brand))
      .limit(1);
    const [salCon] = await db
      .select({ id: schema.extYarnSalContract.id })
      .from(schema.extYarnSalContract)
      .where(eq(schema.extYarnSalContract.brand, brand))
      .limit(1);
    const [warp] = await db
      .select({ id: schema.extGreyConvWarp.id })
      .from(schema.extGreyConvWarp)
      .where(eq(schema.extGreyConvWarp.brand, brand))
      .limit(1);
    const [weft] = await db
      .select({ id: schema.extGreyConvWeft.id })
      .from(schema.extGreyConvWeft)
      .where(eq(schema.extGreyConvWeft.brand, brand))
      .limit(1);
    const [intWarp] = await db
      .select({ id: schema.intGreyConversionWarp.id })
      .from(schema.intGreyConversionWarp)
      .where(eq(schema.intGreyConversionWarp.brand, brand))
      .limit(1);
    const [intWeft] = await db
      .select({ id: schema.intGreyConversionWeft.id })
      .from(schema.intGreyConversionWeft)
      .where(eq(schema.intGreyConversionWeft.brand, brand))
      .limit(1);
    const [invRef] = await db
      .select({ id: schema.inventoryOpening.id })
      .from(schema.inventoryOpening)
      .where(eq(schema.inventoryOpening.brand, brand))
      .limit(1);

    if (purCon || salCon || warp || weft || intWarp || intWeft || invRef) {
      redirect(`/define/yarn-brands?id=${id}&error=in_use`);
    }

    await db
      .delete(schema.yarnBrands)
      .where(eq(schema.yarnBrands.id, numId));
    revalidatePath("/define/yarn-brands");
    redirect("/define/yarn-brands");
  }

  return (
    <Shell active="yarn-brands">
      <div className="animate-in">
        <h1 className="page-title mb-8">Yarn Brands</h1>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {selected ? "Edit Brand" : "New Brand"}
            </div>
            <div className="flex gap-2">
              <a href="/define/yarn-brands" className="btn btn-outline btn-sm">New</a>
              {selected && (
                <form action={deleteBrand} className="inline">
                  <input type="hidden" name="id" value={selected.id} />
                  <ConfirmButton>Delete</ConfirmButton>
                </form>
              )}
            </div>
          </div>

          {params.error === "in_use" && (
            <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
              This brand is referenced by yarn contracts, conversion contracts, or inventory openings and cannot be deleted.
            </div>
          )}
          <form action={saveBrand}>
            {selected && <input type="hidden" name="id" value={selected.id} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <label className="label block mb-1">Description</label>
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

        <div className="flex items-center gap-2 mb-3">
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
          <form method="GET" className="flex-1 flex gap-2">
            <input
              name="find"
              className="input-box flex-1 text-[13px]"
              placeholder="Search brand..."
              defaultValue={params.find ?? ""}
            />
          </form>
        </div>

        <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b, i) => {
                const isSelected = b.id === selected?.id;
                return (
                  <tr
                    key={b.id}
                    className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px]">
                      <a
                        href={`/define/yarn-brands?id=${b.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {i + 1}
                      </a>
                    </td>
                    <td>
                      <a
                        href={`/define/yarn-brands?id=${b.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {b.name}
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
