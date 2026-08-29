import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { AccountPicker } from "@/components/account-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Account = typeof schema.chartOfAccounts.$inferSelect;

export default async function ChartOfAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; adding?: string; find?: string; error?: string }>;
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

  // Parent "Acc. Head" options. Level 5 parties are excluded — a party cannot
  // be a parent of another party; only L1–L4 heads can host children.
  const allAccounts = await db.select().from(schema.chartOfAccounts).orderBy(schema.chartOfAccounts.code);
  const accDescByCode = new Map(allAccounts.map((a) => [a.code, a.description]));
  const headOpts = allAccounts
    .filter((a) => (a.level ?? a.code.split(".").length) <= 4)
    .map((a) => {
      const depth = a.code.split(".").length;
      const kids = allAccounts.filter((x) => x.code.startsWith(a.code + ".") && x.code.split(".").length === depth + 1);
      const maxN = kids.reduce((m, c) => { const n = parseInt(c.code.split(".").pop() || "0", 10); return Number.isFinite(n) && n > m ? n : m; }, 0);
      const width = kids.length ? Math.max(...kids.map((c) => (c.code.split(".").pop() || "").length)) : 4;
      return { value: a.code, label: `${a.code} — ${a.description}`, desc: `${a.code}.${String(maxN + 1).padStart(width, "0")}` };
    });

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
    const submittedCode = (formData.get("code") as string)?.trim();
    const accHead = (formData.get("acc_head") as string)?.trim();
    const description = (formData.get("tittle") as string)?.trim();
    if (!description) return;
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

    const existing = submittedCode
      ? await db.select().from(schema.chartOfAccounts).where(eq(schema.chartOfAccounts.code, submittedCode))
      : [];

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
        .where(eq(schema.chartOfAccounts.code, submittedCode));
      revalidatePath("/accounts");
      redirect(`/accounts?code=${submittedCode}`);
    }

    if (!accHead) return;
    const parentRows = await db.select().from(schema.chartOfAccounts).where(eq(schema.chartOfAccounts.code, accHead)).limit(1);
    if (!parentRows.length) return;
    const parentCode = parentRows[0].code;
    // Guard: only L1–L4 heads can be parents. L5 parties cannot have children.
    if (parentCode.split(".").length >= 5) {
      redirect(`/accounts?adding=1&error=parent_too_deep`);
    }

    let newCode = "";
    let codeExists = false;
    try {
      newCode = await db.transaction(async (tx) => {
        const depth = parentCode.split(".").length;
        const siblings = await tx
          .select({ code: schema.chartOfAccounts.code })
          .from(schema.chartOfAccounts)
          .where(sql`${schema.chartOfAccounts.code} LIKE ${parentCode + ".%"} ESCAPE '\\'`);
        const children = siblings.filter((a) => a.code.split(".").length === depth + 1);
        const maxN = children.reduce((m, c) => { const n = parseInt(c.code.split(".").pop() || "0", 10); return Number.isFinite(n) && n > m ? n : m; }, 0);
        const width = children.length ? Math.max(...children.map((c) => (c.code.split(".").pop() || "").length)) : 4;
        const code = `${parentCode}.${String(maxN + 1).padStart(width, "0")}`;
        const level = code.split(".").length;
        await tx.insert(schema.chartOfAccounts).values({
          code, codeHead: parentCode, level, description, descShort, address, city,
          phone, mobile, fax, email, gstNo, ntn, nic, creditLimit, remarks,
          contactPerson1, contactDesig1, contactNo1,
          contactPerson2, contactDesig2, contactNo2,
          contactPerson3, contactDesig3, contactNo3,
          status,
        });
        return code;
      });
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (/UNIQUE|constraint/i.test(msg)) codeExists = true;
      else throw e;
    }
    if (codeExists) redirect(`/accounts?error=code_exists&adding=1`);
    revalidatePath("/accounts");
    redirect(`/accounts?code=${newCode}`);
  }

  async function deleteAccount(formData: FormData) {
    "use server";
    const code = (formData.get("code") as string)?.trim();
    if (!code) return;
    const esc = code.replace(/[\\%_]/g, (m) => "\\" + m);
    const children = await db
      .select({ code: schema.chartOfAccounts.code })
      .from(schema.chartOfAccounts)
      .where(
        or(
          eq(schema.chartOfAccounts.codeHead, code),
          sql`${schema.chartOfAccounts.code} LIKE ${esc + ".%"} ESCAPE '\\'`,
        ),
      )
      .limit(1);
    const refs = children.length
      ? children
      : await db
          .select({ id: schema.transDetail.id })
          .from(schema.transDetail)
          .where(eq(schema.transDetail.accCode, code))
          .limit(1);
    if (refs.length > 0) {
      redirect(`/accounts?code=${encodeURIComponent(code)}&error=in_use`);
    }
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
        </div>

        {params.error === "in_use" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Account cannot be deleted: it has child accounts or is used in transactions.
          </div>
        )}
        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Account code was just taken by another save. Try again.
          </div>
        )}
        {params.error === "parent_too_deep" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Parent must be a Level 1–4 head. A Level 5 party cannot host children.
          </div>
        )}
        <div className="hidden">
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
                      <ConfirmButton message="Delete this account? This cannot be undone.">Del</ConfirmButton>
                    </form>
                  )}
                </div>
              </div>

              <form action={saveAccount}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div className="sm:col-span-2 flex items-end gap-3">
                    <div>
                      <label className="label block mb-1">Chart Level</label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((lvl) => {
                          const active = (formAccount?.level ?? 0) === lvl;
                          return (
                            <span
                              key={lvl}
                              className={`inline-flex items-center justify-center mono text-[11px] font-bold border ${active ? "bg-black text-white border-black" : "bg-white text-[var(--muted)] border-[var(--border)]"}`}
                              style={{ width: 28, height: 28 }}
                              title={`Level ${lvl}${active ? " (current)" : ""}`}
                            >
                              L{lvl}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] pb-1">
                      Level auto-derived from Code hierarchy — not editable
                    </div>
                  </div>

                  <div>
                    <label className="label block mb-1">
                      Acc. Head <span className="text-[9px] font-normal">(F9)</span>
                    </label>
                    {formAccount ? (
                      <input
                        className="input-box mono bg-gray-100"
                        value={
                          formAccount.codeHead
                            ? `${formAccount.codeHead}${accDescByCode.get(formAccount.codeHead) ? ` — ${accDescByCode.get(formAccount.codeHead)}` : ""}`
                            : ""
                        }
                        readOnly
                        tabIndex={-1}
                      />
                    ) : (
                      <div className="flex items-center gap-1" data-picker-target="acc_head">
                        <div className="flex-1"><Combobox name="acc_head" options={headOpts} placeholder="Select parent head" descTargetId="acct-code" /></div>
                        <AccountPicker
                          targetName="acc_head"
                          options={allAccounts
                            .filter((a) => (a.level ?? a.code.split(".").length) <= 4)
                            .map((a) => ({ code: a.code, description: a.description, level: a.level ?? 1 }))}
                          label="Select Parent Account Head (L1–L4 only)"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="label block mb-1">Code</label>
                    <input
                      id="acct-code"
                      name="code"
                      className="input-box mono bg-gray-100"
                      defaultValue={formAccount?.code ?? ""}
                      placeholder="auto"
                      readOnly
                      tabIndex={-1}
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
            <div className="text-[10px] text-[var(--muted)] mb-2 flex gap-3 flex-wrap">
              <span><span className="inline-block w-3 h-3 align-middle" style={{ background: "#0f172a" }}></span> L1 Head</span>
              <span><span className="inline-block w-3 h-3 align-middle" style={{ background: "#334155" }}></span> L2 Group</span>
              <span><span className="inline-block w-3 h-3 align-middle" style={{ background: "#64748b" }}></span> L3 Sub</span>
              <span><span className="inline-block w-3 h-3 align-middle" style={{ background: "#94a3b8" }}></span> L4 Head</span>
              <span><span className="inline-block w-3 h-3 align-middle border border-[var(--border)]" style={{ background: "white" }}></span> L5 Party</span>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table>
                <thead className="sticky top-0 bg-white z-10">
                  <tr>
                    <th style={{ width: 30 }}>L</th>
                    <th>Code</th>
                    <th>Account Title</th>
                    <th>Sh.Name</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => {
                    const level = acc.level ?? 1;
                    const isSelected = acc.code === selected?.code;
                    const rowHref = `/accounts?code=${acc.code}${params.find ? `&find=${encodeURIComponent(params.find)}` : ""}`;
                    const linkStyle = { color: isSelected ? "white" : "inherit" };
                    // Per-level styling — headers are bold/darker, parties are lighter
                    const levelStyles: Record<number, { bg: string; badge: string; font: string; weight: string }> = {
                      1: { bg: "#f1f5f9", badge: "#0f172a", font: "text-[13px]", weight: "font-bold uppercase tracking-wide" },
                      2: { bg: "#f8fafc", badge: "#334155", font: "text-[13px]", weight: "font-semibold" },
                      3: { bg: "#fafbfc", badge: "#64748b", font: "text-[13px]", weight: "font-medium" },
                      4: { bg: "white", badge: "#94a3b8", font: "text-[13px]", weight: "font-normal" },
                      5: { bg: "white", badge: "transparent", font: "text-[12px] text-[var(--muted)]", weight: "font-normal" },
                    };
                    const st = levelStyles[level] ?? levelStyles[5];
                    const rowBg = isSelected ? "bg-black text-white" : "cursor-pointer hover:bg-gray-100";
                    const inlineBg = isSelected ? undefined : st.bg;
                    return (
                      <tr key={acc.code} className={rowBg} style={inlineBg ? { background: inlineBg } : undefined}>
                        <td className="text-center p-0" style={{ width: 30 }}>
                          <a href={rowHref} className="no-underline block px-2 py-1 text-center" style={linkStyle}>
                            <span
                              className="inline-block mono text-[9px] font-bold"
                              style={{
                                background: isSelected ? "white" : st.badge,
                                color: isSelected ? "black" : "white",
                                width: 18, height: 18, lineHeight: "18px", borderRadius: 2,
                                opacity: level === 5 ? 0.3 : 1,
                              }}
                            >
                              {level}
                            </span>
                          </a>
                        </td>
                        <td className="mono text-[12px] p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {acc.code}
                          </a>
                        </td>
                        <td className={`${st.font} p-0`}>
                          <a href={rowHref} className={`no-underline block px-2 py-1 ${st.weight}`} style={{ ...linkStyle, paddingLeft: `${8 + (level - 1) * 18}px` }}>
                            {level < 5 && <span className="text-[var(--muted)] mr-1">{"›".repeat(level - 1)}</span>}
                            {acc.description}
                          </a>
                        </td>
                        <td className="mono text-[11px] text-[var(--muted)] p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {acc.descShort}
                          </a>
                        </td>
                        <td className="text-center" style={{ width: 40 }}>
                          <form action={deleteAccount} className="inline">
                            <input type="hidden" name="code" value={acc.code} />
                            <ConfirmButton
                              message={`Delete account ${acc.code} — "${acc.description}"?\n\nThis cannot be undone.`}
                              className="mono text-[13px]"
                              style={{ background: "transparent", border: "none", color: isSelected ? "white" : "var(--danger)", padding: "2px 6px", cursor: "pointer" }}
                            >
                              ✕
                            </ConfirmButton>
                          </form>
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
