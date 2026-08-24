import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { ConfirmButton } from "@/components/confirm-button";
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

export default async function KnottingContractPage({
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
        .from(schema.intKnottingContract)
        .where(sql`
          ${schema.intKnottingContract.contNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intKnottingContract.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intKnottingContract.type} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intKnottingContract.id))
    : await db
        .select()
        .from(schema.intKnottingContract)
        .orderBy(desc(schema.intKnottingContract.id));

  const selected = isEditing ? contracts.find((c) => c.id === idParam) ?? null : null;
  const formContract = isAdding ? null : selected;

  const nextRow = await db
    .select({
      maxN: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 5) AS INTEGER)), 0)`,
    })
    .from(schema.intKnottingContract);
  const upcomingNumber = (nextRow[0]?.maxN ?? 0) + 1;
  const upcomingContNo = `IKC-${String(upcomingNumber).padStart(4, "0")}`;

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 4`)
    .orderBy(schema.chartOfAccounts.description);
  const partyOpts = parties.map((p) => ({ value: String(p.code), label: `${p.code} — ${p.description}` }));

  async function saveContract(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const contDate = txt(formData.get("cont_date")) ?? today();
    const expDate = txt(formData.get("exp_date"));
    const party = txt(formData.get("party"));
    const type = txt(formData.get("type"));
    const ratePerEnds = num(formData.get("rate_per_ends"));
    const ratePerBeam = num(formData.get("rate_per_beam"));
    const terms = txt(formData.get("terms"));
    const remarks = txt(formData.get("remarks"));
    const status = txt(formData.get("status")) ?? "R";

    if ((ratePerEnds ?? 0) <= 0 && (ratePerBeam ?? 0) <= 0) {
      const back =
        Number.isFinite(id) && id > 0
          ? `/inventory/contracts/knotting?id=${id}&error=rate_required`
          : `/inventory/contracts/knotting?adding=1&error=rate_required`;
      redirect(back);
    }

    const nowIso = new Date().toISOString();

    if (Number.isFinite(id) && id > 0) {
      await db
        .update(schema.intKnottingContract)
        .set({
          contDate,
          expDate,
          party,
          type,
          ratePerEnds,
          ratePerBeam,
          terms,
          remarks,
          status,
          modifiedDate: nowIso,
        })
        .where(eq(schema.intKnottingContract.id, id));
      revalidatePath("/inventory/contracts/knotting");
      redirect(`/inventory/contracts/knotting?id=${id}`);
    } else {
      let newId = 0;
      let codeExists = false;
      try {
        newId = await db.transaction(async (tx) => {
          const row = await tx
            .select({
              maxN: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 5) AS INTEGER)), 0)`,
            })
            .from(schema.intKnottingContract);
          const nextN = (row[0]?.maxN ?? 0) + 1;
          const contNo = `IKC-${String(nextN).padStart(4, "0")}`;

          const inserted = await tx
            .insert(schema.intKnottingContract)
            .values({
              contNo,
              contDate,
              expDate,
              party,
              type,
              ratePerEnds,
              ratePerBeam,
              terms,
              remarks,
              status,
              postedDate: nowIso,
            })
            .returning({ id: schema.intKnottingContract.id });
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
        redirect(`/inventory/contracts/knotting?error=code_exists`);
      }
      revalidatePath("/inventory/contracts/knotting");
      redirect(`/inventory/contracts/knotting?id=${newId}`);
    }
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db
      .delete(schema.intKnottingContract)
      .where(eq(schema.intKnottingContract.id, id));
    revalidatePath("/inventory/contracts/knotting");
    redirect("/inventory/contracts/knotting");
  }

  const statusOptions = [
    { v: "R", l: "R - Running" },
    { v: "C", l: "C - Completed" },
    { v: "F", l: "F - Finished" },
    { v: "X", l: "X - Cancelled" },
  ];

  const typeOptions = ["KNOTTING", "SARNING", "MAROORI"];

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  return (
    <Shell active="int-c-knt">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Knotting / Sarning / Maroori Contract</h1>
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
              type: c.type,
              ratePerEnds: c.ratePerEnds,
              ratePerBeam: c.ratePerBeam,
              status: c.status,
            }))}
            columns={[
              { key: "contNo", label: "Cont#" },
              { key: "contDate", label: "Cont Date" },
              { key: "expDate", label: "Exp Date" },
              { key: "party", label: "Party" },
              { key: "type", label: "Type" },
              { key: "ratePerEnds", label: "Rate/Ends" },
              { key: "ratePerBeam", label: "Rate/Beam" },
              { key: "status", label: "Status" },
            ]}
            filename="int-knotting-contract"
            sheetName="KnottingContract"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Contract number already exists. Try again.
          </div>
        )}
        {params.error === "rate_required" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            At least one of Rate Per Ends or Rate Per Beam must be greater than zero.
          </div>
        )}

        <form
          id="ikc-find-form"
          method="GET"
          action="/inventory/contracts/knotting"
          className="hidden"
        ></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — Knotting / Sarning / Maroori"
                : formContract
                ? `Edit — ${formContract.contNo}`
                : "Knotting / Sarning / Maroori"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <button type="submit" form="ikc-save-form" className="btn btn-sm">
                Save
              </button>
              <a href="/inventory/contracts/knotting?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <PrintButton label="Print" />
              <a href="/inventory/contracts/knotting" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          <form id="ikc-save-form" action={saveContract}>
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
                    form="ikc-find-form"
                    name="find"
                    className="input-box mono flex-1"
                    defaultValue={params.find ?? ""}
                    placeholder="cont / party / type"
                  />
                  <button form="ikc-find-form" type="submit" className="btn btn-outline btn-sm">
                    Find
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6">
                <label className="label block mb-1">Party</label>
                <Combobox
                  name="party"
                  options={partyOpts}
                  defaultValue={formContract?.party ?? ""}
                  placeholder="party account"
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Type</label>
                <select
                  name="type"
                  className="input-box"
                  defaultValue={formContract?.type ?? "KNOTTING"}
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-3">
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

              <div className="lg:col-span-6">
                <label className="label block mb-1">Rate Per Ends</label>
                <input
                  name="rate_per_ends"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.ratePerEnds ?? ""}
                />
              </div>
              <div className="lg:col-span-6">
                <label className="label block mb-1">Rate Per Beam</label>
                <input
                  name="rate_per_beam"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.ratePerBeam ?? ""}
                />
              </div>

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
              <a href="/inventory/contracts/knotting?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <PrintButton label="Print" />
              <a href="/inventory/contracts/knotting" className="btn btn-outline btn-sm">
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
              <ConfirmButton message="Delete this contract permanently? This cannot be undone.">
                Delete
              </ConfirmButton>
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
                  <th>Type</th>
                  <th className="text-right">Rate/Ends</th>
                  <th className="text-right">Rate/Beam</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const isSel = c.id === selected?.id;
                  const href = `/inventory/contracts/knotting?id=${c.id}`;
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
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.type ?? "-"}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.ratePerEnds)}
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
