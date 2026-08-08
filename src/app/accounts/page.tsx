import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Account = typeof schema.chartOfAccounts.$inferSelect;

export default async function ChartOfAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; adding?: string; find?: string }>;
}) {
  const params = await searchParams;
  const findFilter = params.find?.trim();
  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = `%${escFind}%`;
  const accounts = findFilter
    ? await db
        .select()
        .from(schema.chartOfAccounts)
        .where(
          or(
            sql`${schema.chartOfAccounts.code} LIKE ${pat} ESCAPE '\\'`,
            sql`${schema.chartOfAccounts.description} LIKE ${pat} ESCAPE '\\'`,
            sql`${schema.chartOfAccounts.descShort} LIKE ${pat} ESCAPE '\\'`
          )
        )
        .orderBy(schema.chartOfAccounts.code)
    : await db
        .select()
        .from(schema.chartOfAccounts)
        .orderBy(schema.chartOfAccounts.code);

  const cities = await db.select().from(schema.cities);

  const selected = params.code
    ? accounts.find((a) => a.code === params.code) ?? null
    : null;

  const headCounts = accounts.reduce(
    (acc, a) => {
      if (a.level === 1) acc.heads++;
      else if (a.level === 2) acc.groups++;
      else acc.details++;
      return acc;
    },
    { heads: 0, groups: 0, details: 0 }
  );

  async function saveAccount(formData: FormData) {
    "use server";
    const code = (formData.get("code") as string)?.trim();
    const description = (formData.get("tittle") as string)?.trim();
    if (!code || !description) return;

    const parts = code.split(".");
    const level = parts.length;
    const codeHead = parts[0];
    const descShort = (formData.get("tittle_short") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const city = (formData.get("area") as string)?.trim() || null;
    const phone = (formData.get("phone_no") as string)?.trim() || null;
    const mobile = (formData.get("cell_no") as string)?.trim() || null;
    const fax = (formData.get("fax") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const gstNo = (formData.get("gst_no") as string)?.trim() || null;
    const ntn = (formData.get("ntn_no") as string)?.trim() || null;
    const nic = (formData.get("nic_no") as string)?.trim() || null;
    const creditLimit = parseFloat(formData.get("credit_limit") as string) || null;
    const remarks = (formData.get("remarks") as string)?.trim() || null;
    const contactPerson1 = (formData.get("contact_person_1") as string)?.trim() || null;
    const contactDesig1 = (formData.get("contact_desig_1") as string)?.trim() || null;
    const contactNo1 = (formData.get("contact_no_1") as string)?.trim() || null;
    const contactPerson2 = (formData.get("contact_person_2") as string)?.trim() || null;
    const contactDesig2 = (formData.get("contact_desig_2") as string)?.trim() || null;
    const contactNo2 = (formData.get("contact_no_2") as string)?.trim() || null;
    const contactPerson3 = (formData.get("contact_person_3") as string)?.trim() || null;
    const contactDesig3 = (formData.get("contact_desig_3") as string)?.trim() || null;
    const contactNo3 = (formData.get("contact_no_3") as string)?.trim() || null;
    const status = (formData.get("status") as string)?.trim() || "R";

    const existing = await db
      .select()
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, code));

    if (existing.length > 0) {
      await db
        .update(schema.chartOfAccounts)
        .set({
          description, descShort, address, city, phone, mobile, fax, email,
          gstNo, ntn, nic, creditLimit, remarks,
          contactPerson1, contactDesig1, contactNo1,
          contactPerson2, contactDesig2, contactNo2,
          contactPerson3, contactDesig3, contactNo3,
          status,
        })
        .where(eq(schema.chartOfAccounts.code, code));
    } else {
      await db.insert(schema.chartOfAccounts).values({
        code, codeHead, level, description, descShort, address, city,
        phone, mobile, fax, email, gstNo, ntn, nic, creditLimit, remarks,
        contactPerson1, contactDesig1, contactNo1,
        contactPerson2, contactDesig2, contactNo2,
        contactPerson3, contactDesig3, contactNo3,
        status,
      });
    }

    revalidatePath("/accounts");
    redirect(`/accounts?code=${code}`);
  }

  async function deleteAccount(formData: FormData) {
    "use server";
    const code = (formData.get("code") as string)?.trim();
    if (!code) return;
    await db
      .delete(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, code));
    revalidatePath("/accounts");
    redirect("/accounts");
  }

  const isAdding = params.adding === "1";
  const formAccount = isAdding ? null : selected;

  return (
    <Shell active="accounts">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">Chart of Account</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {accounts.length} accounts
            </p>
          </div>
          <ExcelExportButton
            rows={accounts}
            columns={[
              { key: "code", label: "Code" },
              { key: "description", label: "Description" },
              { key: "descShort", label: "Short Name" },
              { key: "level", label: "Level" },
              { key: "city", label: "Area" },
              { key: "phone", label: "Phone" },
              { key: "mobile", label: "Cell" },
              { key: "email", label: "Email" },
              { key: "gstNo", label: "GST" },
              { key: "ntn", label: "NTN" },
              { key: "creditLimit", label: "Credit Limit" },
              { key: "status", label: "Status" },
            ]}
            filename="chart-of-accounts"
            sheetName="Accounts"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{headCounts.heads}</div>
            <div className="stat-label">Head Accounts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{headCounts.groups}</div>
            <div className="stat-label">Groups</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{headCounts.details}</div>
            <div className="stat-label">Detail Accounts</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="border border-black p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding ? "New Account" : formAccount ? "Edit Account" : "Account Details"}
                </div>
                <div className="flex gap-2">
                  <a href="/accounts?adding=1" className="btn btn-outline btn-sm">New</a>
                  {formAccount && (
                    <form action={deleteAccount} className="inline">
                      <input type="hidden" name="code" value={formAccount.code} />
                      <button type="submit" className="btn btn-outline btn-sm">Del</button>
                    </form>
                  )}
                </div>
              </div>

              <form action={saveAccount}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div className="sm:col-span-2">
                    <div className="w-24">
                      <label className="label block mb-1">Chart Level</label>
                      <input
                        className="input-box mono text-center"
                        defaultValue={formAccount?.level ?? ""}
                        readOnly
                        tabIndex={-1}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label block mb-1">Code</label>
                    <input
                      name="code"
                      className="input-box mono"
                      defaultValue={formAccount?.code ?? ""}
                      placeholder="e.g. 7.02.04"
                      required
                      readOnly={!!formAccount}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select
                      name="status"
                      className="input-box"
                      defaultValue={formAccount?.status ?? "R"}
                    >
                      <option value="R">R - Running</option>
                      <option value="A">A - Active</option>
                      <option value="C">C - Closed</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="label block mb-1">Tittle</label>
                    <input
                      name="tittle"
                      className="input-box"
                      defaultValue={formAccount?.description ?? ""}
                      placeholder="Account name"
                      required
                    />
                  </div>

                  <div>
                    <label className="label block mb-1">Tittle Short</label>
                    <input
                      name="tittle_short"
                      className="input-box"
                      defaultValue={formAccount?.descShort ?? ""}
                      placeholder="Short name"
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Credit Limit</label>
                    <input
                      name="credit_limit"
                      type="number"
                      step="any"
                      className="input-box mono"
                      defaultValue={formAccount?.creditLimit ?? ""}
                      placeholder="0"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="label block mb-1">Address</label>
                    <input
                      name="address"
                      className="input-box"
                      defaultValue={formAccount?.address ?? ""}
                    />
                  </div>

                  <div>
                    <label className="label block mb-1">Area</label>
                    <select name="area" className="input-box" defaultValue={formAccount?.city ?? ""}>
                      <option value="">-- Select --</option>
                      {cities.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Phone No</label>
                    <input
                      name="phone_no"
                      className="input-box"
                      defaultValue={formAccount?.phone ?? ""}
                    />
                  </div>

                  <div>
                    <label className="label block mb-1">Cell No</label>
                    <input
                      name="cell_no"
                      className="input-box"
                      defaultValue={formAccount?.mobile ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Fax</label>
                    <input
                      name="fax"
                      className="input-box"
                      defaultValue={formAccount?.fax ?? ""}
                    />
                  </div>

                  <div>
                    <label className="label block mb-1">E-Mail</label>
                    <input
                      name="email"
                      type="email"
                      className="input-box"
                      defaultValue={formAccount?.email ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">G.S.T. No</label>
                    <input
                      name="gst_no"
                      className="input-box mono"
                      defaultValue={formAccount?.gstNo ?? ""}
                    />
                  </div>

                  <div>
                    <label className="label block mb-1">N.T.N No</label>
                    <input
                      name="ntn_no"
                      className="input-box mono"
                      defaultValue={formAccount?.ntn ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">N.I.C No</label>
                    <input
                      name="nic_no"
                      className="input-box mono"
                      defaultValue={formAccount?.nic ?? ""}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="label block mb-1">Remarks</label>
                    <input
                      name="remarks"
                      className="input-box"
                      defaultValue={formAccount?.remarks ?? ""}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mt-2 mb-2">Contact Persons</div>
                    <div className="grid grid-cols-3 gap-2 mb-1">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Name</div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Designation</div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Contact No</div>
                    </div>
                    {[1, 2, 3].map((i) => {
                      const pKey = `contactPerson${i}` as keyof Account;
                      const dKey = `contactDesig${i}` as keyof Account;
                      const cKey = `contactNo${i}` as keyof Account;
                      return (
                        <div key={i} className="grid grid-cols-3 gap-2 mb-1">
                          <input name={`contact_person_${i}`} className="input-box text-[13px]" defaultValue={(formAccount?.[pKey] as string) ?? ""} />
                          <input name={`contact_desig_${i}`} className="input-box text-[13px]" defaultValue={(formAccount?.[dKey] as string) ?? ""} />
                          <input name={`contact_no_${i}`} className="input-box text-[13px]" defaultValue={(formAccount?.[cKey] as string) ?? ""} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/accounts" className="btn btn-outline btn-sm">Cancel</a>
                </div>
              </form>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
              <form method="GET" action="" className="flex-1 flex gap-2">
                <input
                  name="find"
                  className="input-box flex-1 text-[13px]"
                  placeholder="Search account..."
                  defaultValue={params.find ?? ""}
                />
                <button type="submit" className="btn btn-sm">Find</button>
              </form>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account Tille</th>
                    <th>Sh.Name</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr
                      key={acc.code}
                      className={acc.code === selected?.code ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                    >
                      <td className="mono text-[12px]">
                        <a
                          href={`/accounts?code=${acc.code}`}
                          className="no-underline"
                          style={{ color: acc.code === selected?.code ? "white" : "inherit" }}
                        >
                          {acc.code}
                        </a>
                      </td>
                      <td
                        className="text-[13px]"
                        style={{ paddingLeft: `${12 + ((acc.level ?? 1) - 1) * 16}px` }}
                      >
                        <a
                          href={`/accounts?code=${acc.code}`}
                          className="no-underline"
                          style={{ color: acc.code === selected?.code ? "white" : "inherit" }}
                        >
                          {acc.description}
                        </a>
                      </td>
                      <td className="mono text-[11px] text-[var(--muted)]">{acc.descShort}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
