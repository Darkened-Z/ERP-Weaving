import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUniqueViolation } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

export default async function ChartDefinePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const charts = await db.select().from(schema.chartDefine);

  const paramId = params.id ? parseInt(params.id, 10) : NaN;
  const selected = Number.isNaN(paramId)
    ? null
    : charts.find((c) => c.id === paramId) ?? null;

  async function saveChart(formData: FormData) {
    "use server";
    const code = parseInt(formData.get("code") as string, 10);
    const description = (formData.get("description") as string)?.trim();
    if (!code || Number.isNaN(code) || !description) return;

    const srnoRaw = parseInt(formData.get("srno") as string, 10);
    const srno = Number.isNaN(srnoRaw) ? null : srnoRaw;
    const editId = formData.get("id") as string;

    try {
      if (editId) {
        const parsedEditId = parseInt(editId, 10);
        if (Number.isNaN(parsedEditId)) return;
        await db
          .update(schema.chartDefine)
          .set({ code, description, srno })
          .where(eq(schema.chartDefine.id, parsedEditId));
        revalidatePath("/define/chart-define");
        redirect(`/define/chart-define?id=${parsedEditId}`);
      } else {
        const [row] = await db
          .insert(schema.chartDefine)
          .values({ code, description, srno })
          .returning({ id: schema.chartDefine.id });
        revalidatePath("/define/chart-define");
        redirect(`/define/chart-define?id=${row.id}`);
      }
    } catch (e) {
      if (isUniqueViolation(e)) redirect(`/define/chart-define?${editId ? `id=${editId}&` : ""}error=exists`);
      throw e;
    }
  }

  async function deleteChart(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!id || Number.isNaN(id)) return;

    const [row] = await db
      .select({ code: schema.chartDefine.code })
      .from(schema.chartDefine)
      .where(eq(schema.chartDefine.id, id))
      .limit(1);
    if (!row) redirect("/define/chart-define");

    const [coaRef] = await db
      .select({ code: schema.chartOfAccounts.code })
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.codeHead, String(row.code)))
      .limit(1);

    if (coaRef) {
      redirect(`/define/chart-define?id=${id}&error=in_use`);
    }

    await db
      .delete(schema.chartDefine)
      .where(eq(schema.chartDefine.id, id));
    revalidatePath("/define/chart-define");
    redirect("/define/chart-define");
  }

  return (
    <Shell active="chart-define">
      <div className="animate-in">
        <h1 className="page-title mb-8">Chart Define</h1>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {selected ? "Edit Chart" : "New Chart"}
            </div>
            <div className="flex gap-2">
              <a href="/define/chart-define" className="btn btn-outline btn-sm">New</a>
              {selected && (
                <form action={deleteChart} className="inline">
                  <input type="hidden" name="id" value={selected.id} />
                  <ConfirmButton>Delete</ConfirmButton>
                </form>
              )}
            </div>
          </div>

          {params.error === "in_use" && (
            <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
              This chart head is referenced by chart of accounts and cannot be deleted.
            </div>
          )}
          {params.error === "exists" && (
            <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
              That code already exists.
            </div>
          )}
          <form action={saveChart}>
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
                <th>Description</th>
                <th>Sr No.</th>
              </tr>
            </thead>
            <tbody>
              {charts.map((c) => {
                const isSelected = c.id === selected?.id;
                return (
                  <tr
                    key={c.id}
                    className={isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px]">
                      <a
                        href={`/define/chart-define?id=${c.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {c.code}
                      </a>
                    </td>
                    <td>
                      <a
                        href={`/define/chart-define?id=${c.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {c.description}
                      </a>
                    </td>
                    <td className="mono text-[13px]">
                      <a
                        href={`/define/chart-define?id=${c.id}`}
                        className="no-underline"
                        style={{ color: isSelected ? "white" : "inherit" }}
                      >
                        {c.srno}
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
