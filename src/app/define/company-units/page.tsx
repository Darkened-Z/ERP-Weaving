import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CompanyUnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const units = await db.select().from(schema.companyUnits);

  const selected = params.id
    ? units.find((u) => u.code === params.id) ?? null
    : null;

  async function saveUnit(formData: FormData) {
    "use server";
    const code = (formData.get("code") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    if (!code || !description) return;

    const srno = parseInt(formData.get("srno") as string) || null;
    const editCode = formData.get("edit_code") as string;

    if (editCode) {
      await db
        .update(schema.companyUnits)
        .set({ code, srno, description })
        .where(eq(schema.companyUnits.code, editCode));
    } else {
      await db.insert(schema.companyUnits).values({ code, srno, description });
    }

    revalidatePath("/define/company-units");
    redirect(`/define/company-units?id=${code}`);
  }

  async function deleteUnit(formData: FormData) {
    "use server";
    const code = (formData.get("code") as string)?.trim();
    if (!code) return;
    await db
      .delete(schema.companyUnits)
      .where(eq(schema.companyUnits.code, code));
    revalidatePath("/define/company-units");
    redirect("/define/company-units");
  }

  return (
    <Shell active="company-units">
      <div className="animate-in">
        <h1 className="page-title mb-8">Company Unit</h1>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {selected ? "Edit Unit" : "New Unit"}
            </div>
            <div className="flex gap-2">
              <a href="/define/company-units" className="btn btn-outline btn-sm">New</a>
              {selected ? (
                <form action={deleteUnit} className="inline">
                  <input type="hidden" name="code" value={selected.code} />
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
              This company unit is referenced elsewhere and cannot be deleted.
            </div>
          )}
          <form action={saveUnit}>
            {selected && <input type="hidden" name="edit_code" value={selected.code} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 gform">
              <div>
                <label className="label block mb-1">Code</label>
                <input
                  name="code"
                  className="input-box mono"
                  defaultValue={selected?.code ?? ""}
                  required
                />
              </div>
              <div>
                <label className="label block mb-1">Sr No</label>
                <input
                  name="srno"
                  type="number"
                  className="input-box mono"
                  defaultValue={selected?.srno ?? ""}
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
                <th>Code</th>
                <th>Sr No.</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const isSelected = u.code === selected?.code;
                return (
                  <tr
                    key={u.code}
                    className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px]">
                      <a
                        href={`/define/company-units?id=${u.code}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {u.code}
                      </a>
                    </td>
                    <td className="mono text-[13px]">
                      <a
                        href={`/define/company-units?id=${u.code}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {u.srno}
                      </a>
                    </td>
                    <td>
                      <a
                        href={`/define/company-units?id=${u.code}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {u.description}
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
