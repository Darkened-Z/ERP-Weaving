import { Shell } from "@/components/shell";
import { ImageAttach } from "@/components/image-attach";
import { PrintHeader } from "@/components/print-shell";
import { db, schema } from "@/db";
import { getSession, requireSession } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const BASE = "/settings/company-profile";

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const ERR_MSG: Record<string, string> = {
  admin_only: "Only ADMIN can edit company profile.",
  missing_name: "Company name is required.",
  missing_fy: "Current fiscal year, start date and end date are required.",
  bad_fy: "Selected fiscal year does not exist.",
};

async function saveProfile(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (session.roleName !== "ADMIN") redirect(`${BASE}?error=admin_only`);

  const name = txt(formData.get("name"));
  if (!name) redirect(`${BASE}?error=missing_name`);

  const currentFy = txt(formData.get("currentFy"));
  const fyStart = txt(formData.get("fyStart"));
  const fyEnd = txt(formData.get("fyEnd"));
  if (!currentFy || !fyStart || !fyEnd) redirect(`${BASE}?error=missing_fy`);

  const fyRow = await db
    .select({ code: schema.fiscalYears.code })
    .from(schema.fiscalYears)
    .where(eq(schema.fiscalYears.code, currentFy!))
    .limit(1);
  if (!fyRow.length) redirect(`${BASE}?error=bad_fy`);

  const values = {
    name: name!,
    address: txt(formData.get("address")),
    city: txt(formData.get("city")),
    phone: txt(formData.get("phone")),
    email: txt(formData.get("email")),
    ntn: txt(formData.get("ntn")),
    gstNo: txt(formData.get("gstNo")),
    logoDataUrl: txt(formData.get("logoDataUrl")),
    currentFy: currentFy!,
    fyStart: fyStart!,
    fyEnd: fyEnd!,
  };

  const existing = await db
    .select({ id: schema.companyProfile.id })
    .from(schema.companyProfile)
    .limit(1);

  if (existing[0]) {
    await db
      .update(schema.companyProfile)
      .set(values)
      .where(eq(schema.companyProfile.id, existing[0].id));
  } else {
    await db.insert(schema.companyProfile).values(values);
  }

  revalidatePath(BASE);
  redirect(BASE);
}

export default async function CompanyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const isAdmin = session?.roleName === "ADMIN";

  const [profile] = await db.select().from(schema.companyProfile).limit(1);
  const fys = await db
    .select({
      code: schema.fiscalYears.code,
      description: schema.fiscalYears.description,
      startDate: schema.fiscalYears.startDate,
      endDate: schema.fiscalYears.endDate,
    })
    .from(schema.fiscalYears)
    .orderBy(desc(schema.fiscalYears.code));

  const defaultFy = profile?.currentFy ?? fys[0]?.code ?? "";

  return (
    <Shell active="company-profile">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">Company Profile</h1>
            <p className="text-[var(--muted)] text-sm mt-1">
              Displayed on chalans, invoices, bills and vouchers
            </p>
          </div>
        </div>

        {!isAdmin && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can edit company profile
          </div>
        )}

        {params.error && ERR_MSG[params.error] && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {ERR_MSG[params.error]}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="border border-black">
            <div className="border-b border-black px-4 py-2 bg-gray-50 text-[11px] uppercase tracking-[0.1em] font-semibold">
              Company Details
            </div>
            <form action={saveProfile} className="p-4">
              <fieldset disabled={!isAdmin} className="space-y-4">
                <div>
                  <label className="label block mb-1">Company Name *</label>
                  <input
                    name="name"
                    className="input-box"
                    defaultValue={profile?.name ?? ""}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="label block mb-1">Address</label>
                    <input
                      name="address"
                      className="input-box"
                      defaultValue={profile?.address ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">City</label>
                    <input
                      name="city"
                      className="input-box"
                      defaultValue={profile?.city ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Phone</label>
                    <input
                      name="phone"
                      className="input-box mono"
                      defaultValue={profile?.phone ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Email</label>
                    <input
                      name="email"
                      type="email"
                      className="input-box mono"
                      defaultValue={profile?.email ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">NTN</label>
                    <input
                      name="ntn"
                      className="input-box mono"
                      defaultValue={profile?.ntn ?? ""}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">GST / STN No</label>
                    <input
                      name="gstNo"
                      className="input-box mono"
                      defaultValue={profile?.gstNo ?? ""}
                    />
                  </div>
                </div>

                <div>
                  <label className="label block mb-2">Logo</label>
                  <ImageAttach
                    name="logoDataUrl"
                    defaultValue={profile?.logoDataUrl ?? ""}
                    maxPx={600}
                    quality={0.75}
                  />
                  <p className="text-[10px] text-[var(--muted)] mt-1">
                    Stored inline; keep the image small so vouchers load fast.
                  </p>
                </div>

                <div className="border-t border-[var(--border)] pt-4 mt-2">
                  <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3">
                    Fiscal Year
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="label block mb-1">Current FY *</label>
                      {fys.length > 0 ? (
                        <select
                          name="currentFy"
                          className="input-box mono"
                          defaultValue={defaultFy}
                          required
                        >
                          {fys.map((f) => (
                            <option key={f.code} value={f.code}>
                              {f.code} — {f.description}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          name="currentFy"
                          className="input-box mono"
                          defaultValue={defaultFy}
                          required
                        />
                      )}
                    </div>
                    <div>
                      <label className="label block mb-1">FY Start *</label>
                      <input
                        name="fyStart"
                        type="date"
                        className="input-box mono"
                        defaultValue={profile?.fyStart ?? ""}
                        required
                      />
                    </div>
                    <div>
                      <label className="label block mb-1">FY End *</label>
                      <input
                        name="fyEnd"
                        type="date"
                        className="input-box mono"
                        defaultValue={profile?.fyEnd ?? ""}
                        required
                      />
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex justify-end pt-2">
                    <button type="submit" className="btn">
                      Save Profile
                    </button>
                  </div>
                )}
              </fieldset>
            </form>
          </div>

          <div className="space-y-4">
            <div className="border border-black">
              <div className="border-b border-black px-4 py-2 bg-gray-50 text-[11px] uppercase tracking-[0.1em] font-semibold">
                Chalan Header Preview
              </div>
              <div className="p-4 bg-white">
                <PrintHeader
                  title="Delivery Chalan"
                  subtitle="Preview only — reflects the saved profile"
                />
                <div className="text-[11px] text-[var(--muted)] mono">
                  This is how every printed chalan, invoice and bill header
                  will look after saving. Save to refresh.
                </div>
              </div>
            </div>

            <div className="border border-black p-4">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                Note
              </div>
              <p className="text-[12px] text-[var(--muted)] leading-relaxed">
                Only one company profile row exists — every printout consumes
                it via <span className="mono">PrintHeader</span>. Changing the
                current fiscal year here affects the default FY on new
                vouchers and dashboards.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
