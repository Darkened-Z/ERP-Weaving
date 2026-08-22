import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

export default async function GreyConstructionPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string }>;
}) {
  const params = await searchParams;
  const rows = await db.select().from(schema.greyConstruction).orderBy(schema.greyConstruction.code);
  const yarnBlends = await db.select().from(schema.yarnBlends);
  const yarnCounts = await db.select().from(schema.yarnCounts).orderBy(schema.yarnCounts.countCode);
  const countOpts = yarnCounts.map((y) => ({ value: y.countCode, label: `${y.countCode} — ${y.description}` }));
  const nextCode = "GC-" + String(
    rows.reduce((max, r) => {
      const m = (r.code ?? "").match(/(\d+)$/);
      const n = m ? parseInt(m[1], 10) : 0;
      return n > max ? n : max;
    }, 0) + 1
  ).padStart(3, "0");

  const selected = params.id
    ? rows.find((r) => r.id === parseInt(params.id!, 10)) ?? null
    : null;
  const isAdding = params.adding === "1";
  const formItem = isAdding ? null : selected;

  async function saveConstruction(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const code = (formData.get("gray_code") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || code || "";
    if (!code) return;

    const reed = num(formData.get("reed"));
    const pick = num(formData.get("pick"));
    const warpCount = (formData.get("warp_count") as string)?.trim() || null;
    const warp2 = (formData.get("warp_2") as string)?.trim() || null;
    const warp3 = (formData.get("warp_3") as string)?.trim() || null;
    const warp4 = (formData.get("warp_4") as string)?.trim() || null;
    const warp5 = (formData.get("warp_5") as string)?.trim() || null;
    const warp6 = (formData.get("warp_6") as string)?.trim() || null;
    const warp7 = (formData.get("warp_7") as string)?.trim() || null;
    const warp8 = (formData.get("warp_8") as string)?.trim() || null;
    const weftCount = (formData.get("weft_count") as string)?.trim() || null;
    const weft2 = (formData.get("weft_2") as string)?.trim() || null;
    const weft3 = (formData.get("weft_3") as string)?.trim() || null;
    const weft4 = (formData.get("weft_4") as string)?.trim() || null;
    const weft5 = (formData.get("weft_5") as string)?.trim() || null;
    const weft6 = (formData.get("weft_6") as string)?.trim() || null;
    const weft7 = (formData.get("weft_7") as string)?.trim() || null;
    const weft8 = (formData.get("weft_8") as string)?.trim() || null;
    const blend = (formData.get("blend") as string)?.trim() || null;
    const status = (formData.get("status") as string)?.trim() || "A";

    const data = {
      code, description, reed, pick,
      warpCount, warp2, warp3, warp4, warp5, warp6, warp7, warp8,
      weftCount, weft2, weft3, weft4, weft5, weft6, weft7, weft8,
      blend, status,
    };

    let insertedId: number | null = null;
    let uniqueError = false;
    try {
      if (id) {
        const parsedId = parseInt(id, 10);
        if (!Number.isFinite(parsedId)) return;
        await db.update(schema.greyConstruction).set(data).where(eq(schema.greyConstruction.id, parsedId));
      } else {
        const [inserted] = await db.insert(schema.greyConstruction).values(data).returning({ id: schema.greyConstruction.id });
        insertedId = inserted.id;
      }
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? "");
      const code = String((e as { code?: string })?.code ?? "");
      if (msg.includes("UNIQUE") || code === "SQLITE_CONSTRAINT_UNIQUE") {
        uniqueError = true;
      } else {
        throw e;
      }
    }

    if (uniqueError) {
      const q = id ? `?id=${id}&error=code_exists` : `?adding=1&error=code_exists`;
      redirect("/define/grey-construction" + q);
    }

    revalidatePath("/define/grey-construction");
    if (id) {
      redirect(`/define/grey-construction?id=${id}`);
    } else {
      redirect(`/define/grey-construction?id=${insertedId}`);
    }
  }

  async function deleteConstruction(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.delete(schema.greyConstruction).where(eq(schema.greyConstruction.id, id));
    revalidatePath("/define/grey-construction");
    redirect("/define/grey-construction");
  }

  const warpFields = [
    { name: "warp_count", label: "Warp", value: formItem?.warpCount },
    { name: "warp_2", label: "RPT 2", value: formItem?.warp2 },
    { name: "warp_3", label: "RPT 3", value: formItem?.warp3 },
    { name: "warp_4", label: "RPT 4", value: formItem?.warp4 },
    { name: "warp_5", label: "RPT 5", value: formItem?.warp5 },
    { name: "warp_6", label: "RPT 6", value: formItem?.warp6 },
  ];

  const weftFields = [
    { name: "weft_count", label: "Weft", value: formItem?.weftCount },
    { name: "weft_2", label: "RPT 2", value: formItem?.weft2 },
    { name: "weft_3", label: "RPT 3", value: formItem?.weft3 },
    { name: "weft_4", label: "RPT 4", value: formItem?.weft4 },
    { name: "weft_5", label: "RPT 5", value: formItem?.weft5 },
    { name: "weft_6", label: "RPT 6", value: formItem?.weft6 },
  ];

  const rowHref = (id: number) => `/define/grey-construction?id=${id}`;

  return (
    <Shell active="grey-construction">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            GRAY CONSTRUCTION (WVG){" "}
            <span className="text-[var(--muted)] text-lg font-normal">({rows.length})</span>
          </h1>
          <ExcelExportButton
            rows={rows}
            columns={[
              { key: "code", label: "Code" },
              { key: "description", label: "Description" },
              { key: "reed", label: "Read" },
              { key: "pick", label: "Pick" },
              { key: "warpCount", label: "Warp Count" },
              { key: "weftCount", label: "Weft Count" },
              { key: "blend", label: "Blend" },
              { key: "status", label: "Status" },
            ]}
            filename="grey-construction"
            sheetName="GreyConstruction"
          />
        </div>

        <div className="border border-black p-6 mb-8">
          {params.error === "code_exists" && (
            <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
              Gray Code already exists. Choose a different code.
            </div>
          )}
          <form action={saveConstruction}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="label block mb-1">Read</label>
                <input name="reed" type="number" step="any" className="input-box mono" defaultValue={formItem?.reed ?? ""} />
              </div>
              <div>
                <label className="label block mb-1">Pick</label>
                <input name="pick" type="number" step="any" className="input-box mono" defaultValue={formItem?.pick ?? ""} />
              </div>
              <div>
                <label className="label block mb-1">Gray Code</label>
                <input name="gray_code" className="input-box mono bg-gray-100" value={formItem?.code ?? nextCode} readOnly tabIndex={-1} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 border-b border-black pb-1">Warp</div>
                <div className="grid grid-cols-1 gap-1">
                  {warpFields.map((f) => (
                    <div key={f.name} className="flex items-center gap-2">
                      <label className="label w-12 text-[11px] shrink-0">{f.label}</label>
                      <div className="flex-1"><Combobox name={f.name} options={countOpts} defaultValue={f.value ?? ""} className="input-box mono text-[13px]" /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 border-b border-black pb-1">Weft</div>
                <div className="grid grid-cols-1 gap-1">
                  {weftFields.map((f) => (
                    <div key={f.name} className="flex items-center gap-2">
                      <label className="label w-12 text-[11px] shrink-0">{f.label}</label>
                      <div className="flex-1"><Combobox name={f.name} options={countOpts} defaultValue={f.value ?? ""} className="input-box mono text-[13px]" /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="label block mb-1">Blend</label>
                <select name="blend" className="input-box" defaultValue={formItem?.blend ?? ""}>
                  <option value="">—</option>
                  {yarnBlends.map((b) => (
                    <option key={b.id} value={b.description}>{b.description}</option>
                  ))}
                  {formItem?.blend && !yarnBlends.some((b) => b.description === formItem.blend) && (
                    <option value={formItem.blend}>{formItem.blend}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="label block mb-1">Status</label>
                <select name="status" className="input-box" defaultValue={formItem?.status ?? "A"}>
                  <option value="A">A</option>
                  <option value="R">R</option>
                  <option value="C">C</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex items-center gap-1 mr-2">
                <label className="label">Pasward</label>
                <input type="password" name="pswd" className="input-box mono w-28" tabIndex={-1} />
              </div>
              <button type="submit" className="btn btn-sm">Save</button>
              <a href="/define/grey-construction?adding=1" className="btn btn-outline btn-sm">New</a>
              <a href="/define/grey-construction" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </form>
          {formItem && (
            <form action={deleteConstruction} className="inline mt-2">
              <input type="hidden" name="id" value={formItem.id} />
              <button type="submit" className="btn btn-outline btn-sm">Del</button>
            </form>
          )}
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Read</th>
                <th>Pick</th>
                <th>Warp</th>
                <th>Gray Code</th>
                <th>Weft</th>
                <th>Blend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isSel = r.id === selected?.id;
                const linkStyle = { color: isSel ? "white" : "inherit" };
                const href = rowHref(r.id);
                return (
                  <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                    <td className="mono">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.reed ?? "-"}
                      </a>
                    </td>
                    <td className="mono">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.pick ?? "-"}
                      </a>
                    </td>
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.warpCount ?? "-"}
                      </a>
                    </td>
                    <td className="mono font-bold">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.code}
                      </a>
                    </td>
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.weftCount ?? "-"}
                      </a>
                    </td>
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.blend ?? "-"}
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
