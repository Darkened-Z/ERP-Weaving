import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

const intVal = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v as string, 10);
  return Number.isFinite(n) ? n : null;
};

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const today = () => new Date().toISOString().slice(0, 10);

export default async function BeamContractExtWsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";

  const findFilter = params.find?.trim();
  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = escFind ? `%${escFind}%` : "";

  const contracts = findFilter
    ? await db
        .select()
        .from(schema.intBeamContractExtWs)
        .where(sql`
          ${schema.intBeamContractExtWs.contNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intBeamContractExtWs.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intBeamContractExtWs.sizingParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intBeamContractExtWs.warpingParty} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intBeamContractExtWs.id))
    : await db
        .select()
        .from(schema.intBeamContractExtWs)
        .orderBy(desc(schema.intBeamContractExtWs.id));

  const selected = isEditing ? contracts.find((c) => c.id === idParam) ?? null : null;
  const formContract = isAdding ? null : selected;

  const nextRow = await db
    .select({
      maxN: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 6) AS INTEGER)), 0)`,
    })
    .from(schema.intBeamContractExtWs);
  const upcomingNumber = (nextRow[0]?.maxN ?? 0) + 1;
  const upcomingContNo = `IBWS-${String(upcomingNumber).padStart(4, "0")}`;

  async function saveContract(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const contDate = txt(formData.get("cont_date")) ?? today();
    const expDate = txt(formData.get("exp_date"));
    const sizingParty = txt(formData.get("sizing_party"));
    const warpingParty = txt(formData.get("warping_party"));
    const party = txt(formData.get("party"));
    const ratePerBeam = num(formData.get("rate_per_beam"));
    const terms = txt(formData.get("terms"));
    const remarks = txt(formData.get("remarks"));
    const status = txt(formData.get("status")) ?? "R";

    const nowIso = new Date().toISOString();

    if (Number.isFinite(id) && id > 0) {
      await db
        .transaction(async (tx) => {
          await tx
            .update(schema.intBeamContractExtWs)
            .set({
              contDate,
              expDate,
              sizingParty,
              warpingParty,
              party,
              ratePerBeam,
              terms,
              remarks,
              status,
              modifiedDate: nowIso,
            })
            .where(eq(schema.intBeamContractExtWs.id, id));
        });
      revalidatePath("/inventory/contracts/beam-ext-ws");
      redirect(`/inventory/contracts/beam-ext-ws?id=${id}`);
    } else {
      let newId = 0;
      let codeExists = false;
      try {
        newId = await db.transaction(async (tx) => {
          const row = await tx
            .select({
              maxN: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 6) AS INTEGER)), 0)`,
            })
            .from(schema.intBeamContractExtWs);
          const nextN = (row[0]?.maxN ?? 0) + 1;
          const contNo = `IBWS-${String(nextN).padStart(4, "0")}`;

          const inserted = await tx
            .insert(schema.intBeamContractExtWs)
            .values({
              contNo,
              contDate,
              expDate,
              sizingParty,
              warpingParty,
              party,
              ratePerBeam,
              terms,
              remarks,
              status,
              postedDate: nowIso,
            })
            .returning({ id: schema.intBeamContractExtWs.id });
          return inserted[0].id;
        });
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message ?? "";
        if (/UNIQUE|constraint/i.test(msg)) {
          codeExists = true;
        } else {
          throw e;
        }
      }

      if (codeExists) {
        redirect(`/inventory/contracts/beam-ext-ws?error=code_exists`);
      }
      revalidatePath("/inventory/contracts/beam-ext-ws");
      redirect(`/inventory/contracts/beam-ext-ws?id=${newId}`);
    }
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db
      .delete(schema.intBeamContractExtWs)
      .where(eq(schema.intBeamContractExtWs.id, id));
    revalidatePath("/inventory/contracts/beam-ext-ws");
    redirect("/inventory/contracts/beam-ext-ws");
  }

  const statusOptions = [
    { v: "R", l: "R - Running" },
    { v: "C", l: "C - Completed" },
    { v: "F", l: "F - Finished" },
    { v: "X", l: "X - Cancelled" },
  ];

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  return (
    <Shell active="int-c-bews">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Beam Contract External Warping / Sizing</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {contracts.length} contract{contracts.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={contracts.map((c) => ({
              contNo: c.contNo,
              contDate: c.contDate,
              expDate: c.expDate,
              party: c.party,
              sizingParty: c.sizingParty,
              warpingParty: c.warpingParty,
              ratePerBeam: c.ratePerBeam,
              status: c.status,
            }))}
            columns={[
              { key: "contNo", label: "Cont#" },
              { key: "contDate", label: "Cont Date" },
              { key: "expDate", label: "Exp Date" },
              { key: "party", label: "Party" },
              { key: "sizingParty", label: "Sizing Party" },
              { key: "warpingParty", label: "Warping Party" },
              { key: "ratePerBeam", label: "Rate/Beam" },
              { key: "status", label: "Status" },
            ]}
            filename="int-beam-contract-ext-ws"
            sheetName="BeamContractExtWs"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Contract number already exists. Try again.
          </div>
        )}

        <form
          id="ibws-find-form"
          method="GET"
          action="/inventory/contracts/beam-ext-ws"
          className="hidden"
        ></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — Beam Contract Ext W/S"
                : formContract
                ? `Edit — ${formContract.contNo}`
                : "Beam Contract Ext W/S"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <button type="submit" form="ibws-save-form" className="btn btn-sm">
                Save
              </button>
              <a href="/inventory/contracts/beam-ext-ws?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <PrintButton label="Print" />
              <a href="/inventory/contracts/beam-ext-ws" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          <form id="ibws-save-form" action={saveContract}>
            {formContract && <input type="hidden" name="id" value={formContract.id} />}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-4 gap-y-3">
              <div className="lg:col-span-3">
                <label className="label block mb-1">Cont. Date</label>
                <input
                  name="cont_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formContract?.contDate ?? today()}
                  required
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Cont.#</label>
                <input
                  className="input-box mono bg-gray-100"
                  defaultValue={formContract?.contNo ?? upcomingContNo}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Exp. Date</label>
                <input
                  name="exp_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formContract?.expDate ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Find</label>
                <div className="flex gap-2">
                  <input
                    form="ibws-find-form"
                    name="find"
                    className="input-box mono flex-1"
                    defaultValue={params.find ?? ""}
                    placeholder="cont / party"
                  />
                  <button form="ibws-find-form" type="submit" className="btn btn-outline btn-sm">
                    Find
                  </button>
                </div>
              </div>

              <div className="lg:col-span-4">
                <label className="label block mb-1">Sizing Party</label>
                <input
                  name="sizing_party"
                  className="input-box mono"
                  defaultValue={formContract?.sizingParty ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Warping Party</label>
                <input
                  name="warping_party"
                  className="input-box mono"
                  defaultValue={formContract?.warpingParty ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Party</label>
                <input
                  name="party"
                  className="input-box mono"
                  defaultValue={formContract?.party ?? ""}
                />
              </div>

              <div className="lg:col-span-4">
                <label className="label block mb-1">Rate Per Beam</label>
                <input
                  name="rate_per_beam"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.ratePerBeam ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Status</label>
                <select
                  name="status"
                  className="input-box"
                  defaultValue={formContract?.status ?? "R"}
                >
                  {statusOptions.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-[var(--muted)] mt-1 mono">
                  (R-Running, C-Completed, F-Finished, X-Cancelled)
                </div>
              </div>
              <div className="lg:col-span-4"></div>

              <div className="lg:col-span-6">
                <label className="label block mb-1">Posted</label>
                <input
                  className="input-box mono bg-gray-100 text-[12px]"
                  defaultValue={formContract?.postedDate?.slice(0, 10) ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-6">
                <label className="label block mb-1">Modified</label>
                <input
                  className="input-box mono bg-gray-100 text-[12px]"
                  defaultValue={formContract?.modifiedDate?.slice(0, 10) ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>

              <div className="lg:col-span-12">
                <label className="label block mb-1">Terms</label>
                <input
                  name="terms"
                  className="input-box"
                  defaultValue={formContract?.terms ?? ""}
                />
              </div>
              <div className="lg:col-span-12">
                <label className="label block mb-1">Remarks</label>
                <input
                  name="remarks"
                  className="input-box"
                  defaultValue={formContract?.remarks ?? ""}
                />
              </div>
            </div>

            <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
              <button type="submit" className="btn btn-sm">
                Save
              </button>
              <a href="/inventory/contracts/beam-ext-ws?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <PrintButton label="Print" />
              <a href="/inventory/contracts/beam-ext-ws" className="btn btn-outline btn-sm">
                Exit
              </a>
              <div className="ml-auto">
                <label className="label block mb-1">Alt-S Password</label>
                <input className="input-box mono" placeholder="password" type="password" />
              </div>
            </div>
          </form>

          {formContract && (
            <form action={deleteContract} className="mt-4 flex items-center gap-3">
              <input type="hidden" name="id" value={formContract.id} />
              <button type="submit" className="btn btn-outline btn-sm">
                Delete
              </button>
              <span className="mono text-[10px] text-[var(--muted)]">
                Deletes the contract permanently.
              </span>
            </form>
          )}
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Contracts
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Cont#</th>
                  <th>Cont Date</th>
                  <th>Exp Date</th>
                  <th>Party</th>
                  <th>Sizing Party</th>
                  <th>Warping Party</th>
                  <th className="text-right">Rate/Beam</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const isSel = c.id === selected?.id;
                  const href = `/inventory/contracts/beam-ext-ws?id=${c.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr
                      key={c.id}
                      className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                    >
                      <td className="mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.contNo}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.contDate}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.expDate ?? "-"}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.party ?? "-"}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.sizingParty ?? "-"}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.warpingParty ?? "-"}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.ratePerBeam)}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.status}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-[13px] text-[var(--muted)] py-6">
                      No contracts. Click <b>New</b> above to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
