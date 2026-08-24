import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { RowClearButton } from "@/components/row-clear-button";
import { RowAutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { JvBalanceBar } from "./balance-bar";
import { db, schema } from "@/db";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const VTYPE = "JV";
const LINE_ROWS = 16;

const TRN_TYPES = [
  "",
  "GENERAL",
  "ADJUSTMENT",
  "PROVISION",
  "DEPRECIATION",
  "ACCRUAL",
  "TRANSFER",
];

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

type ParsedLine = {
  srno: number;
  accCode: string;
  narration: string | null;
  chqNo: string | null;
  chqDate: string | null;
  contNo: string | null;
  ccCode: number | null;
  debit: number;
  credit: number;
};

async function saveVoucher(formData: FormData) {
  "use server";
  try {
  const session = await getSession();
  const utCode = session?.userId ?? null;

  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const editing = Number.isFinite(id) && id > 0;
  const ctx = editing ? `id=${id}` : "adding=1";
  await assertPeriodOpen(txt(formData.get("v_date")) ?? today(), "FINANCE");

  const profile = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const currentFy = profile[0]?.currentFy ?? null;
  if (!currentFy) redirect(`/finance/jv?${ctx}&error=no_fy`);

  let existingMain: typeof schema.transMain.$inferSelect | null = null;
  if (editing) {
    const rows = await db
      .select()
      .from(schema.transMain)
      .where(eq(schema.transMain.id, id))
      .limit(1);
    existingMain = rows[0] ?? null;
    if (!existingMain) redirect(`/finance/jv`);
  }

  const fyForRow = editing ? existingMain!.fyCode : currentFy!;

  const accRows = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
    })
    .from(schema.chartOfAccounts)
    .where(gte(schema.chartOfAccounts.level, 4));
  const byCode = new Map<string, string>();
  const byShort = new Map<string, string>();
  const byDesc = new Map<string, string>();
  for (const a of accRows) {
    byCode.set(a.code.toLowerCase(), a.code);
    if (a.descShort) {
      const k = a.descShort.toLowerCase();
      if (!byShort.has(k)) byShort.set(k, a.code);
    }
    const kd = a.description.toLowerCase();
    if (!byDesc.has(kd)) byDesc.set(kd, a.code);
  }
  const resolveAcc = (short: string, title: string): string | null => {
    for (const cand of [short, title]) {
      if (!cand) continue;
      const k = cand.toLowerCase();
      if (byShort.has(k)) return byShort.get(k)!;
      if (byDesc.has(k)) return byDesc.get(k)!;
      if (byCode.has(k)) return byCode.get(k)!;
    }
    return null;
  };

  const ccRows = await db
    .select({
      code: schema.costCenters.code,
      description: schema.costCenters.description,
    })
    .from(schema.costCenters);
  const ccByDesc = new Map<string, number>();
  const ccByCode = new Map<string, number>();
  for (const c of ccRows) {
    ccByDesc.set(c.description.toLowerCase(), c.code);
    ccByCode.set(String(c.code), c.code);
  }
  const resolveCc = (v: string): number | null => {
    if (!v) return null;
    const k = v.toLowerCase();
    if (ccByDesc.has(k)) return ccByDesc.get(k)!;
    if (ccByCode.has(v)) return ccByCode.get(v)!;
    return null;
  };

  const shortNames = formData.getAll("short_name") as string[];
  const titles = formData.getAll("title") as string[];
  const narrs = formData.getAll("narr") as string[];
  const chqNos = formData.getAll("chq_no") as string[];
  const chqDates = formData.getAll("chq_date") as string[];
  const contNos = formData.getAll("cont_no") as string[];
  const drs = formData.getAll("dr") as string[];
  const crs = formData.getAll("cr") as string[];
  const ccs = formData.getAll("cc") as string[];

  const rowCount = Math.max(
    shortNames.length,
    titles.length,
    drs.length,
    crs.length,
  );

  const lines: ParsedLine[] = [];
  let orphanAmount = false;
  let sumDr = 0;
  let sumCr = 0;

  for (let i = 0; i < rowCount; i++) {
    const short = (shortNames[i] ?? "").trim();
    const title = (titles[i] ?? "").trim();
    const accCode = resolveAcc(short, title);
    const debit = num(drs[i]) ?? 0;
    const credit = num(crs[i]) ?? 0;
    const hasAmount = debit !== 0 || credit !== 0;

    if (accCode === null && !hasAmount) continue;
    if (accCode === null && hasAmount) {
      orphanAmount = true;
      continue;
    }

    sumDr += debit;
    sumCr += credit;
    lines.push({
      srno: lines.length + 1,
      accCode: accCode!,
      narration: txt(narrs[i]),
      chqNo: txt(chqNos[i]),
      chqDate: txt(chqDates[i]),
      contNo: txt(contNos[i]),
      ccCode: resolveCc((ccs[i] ?? "").trim()),
      debit,
      credit,
    });
  }

  const emptyTotals = Math.abs(sumDr) < 0.005 && Math.abs(sumCr) < 0.005;
  if (orphanAmount || lines.length < 2 || emptyTotals) {
    redirect(`/finance/jv?${ctx}&error=incomplete`);
  }
  if (Math.abs(sumDr - sumCr) > 0.01) {
    redirect(`/finance/jv?${ctx}&error=unbalanced`);
  }

  const partyCode = lines[0].accCode;

  const header = {
    vdate: txt(formData.get("v_date")) ?? today(),
    narration: txt(formData.get("narration")),
    dueDate: txt(formData.get("due_date")),
    expDate: txt(formData.get("exp_date")),
    trnType: txt(formData.get("trn_type")),
    balanceAmount: sumDr,
    utCode,
  };

  const nowIso = new Date().toISOString();

  if (editing) {
    const fyCode = existingMain!.fyCode;
    const vno = existingMain!.vno;
    await db.transaction(async (tx) => {
      await tx
        .update(schema.transMain)
        .set({ ...header, vdateModified: nowIso })
        .where(eq(schema.transMain.id, id));

      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.fyCode, fyCode),
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, vno),
          ),
        );

      await tx.insert(schema.transDetail).values(
        lines.map((l) => ({
          fyCode,
          vtype: VTYPE,
          vno,
          srno: l.srno,
          accCode: l.accCode,
          partyCode,
          ccCode: l.ccCode,
          narration: l.narration,
          debit: l.debit,
          credit: l.credit,
          chqNo: l.chqNo,
          chqDate: l.chqDate,
          contNo: l.contNo,
        })),
      );
    });

    revalidatePath("/finance/jv");
    redirect(`/finance/jv?id=${id}`);
  }

  let newId = 0;
  let codeExists = false;
  try {
    newId = await db.transaction(async (tx) => {
      const maxRows = await tx
        .select({ m: sql<number>`coalesce(max(${schema.transMain.vno}), 0)` })
        .from(schema.transMain)
        .where(
          and(
            eq(schema.transMain.fyCode, fyForRow),
            eq(schema.transMain.vtype, VTYPE),
          ),
        );
      const vno = (maxRows[0]?.m ?? 0) + 1;

      const inserted = await tx
        .insert(schema.transMain)
        .values({
          fyCode: fyForRow,
          vtype: VTYPE,
          vno,
          vtime: nowTime(),
          ...header,
        })
        .returning({ id: schema.transMain.id });
      const insertedId = inserted[0].id;

      await tx.insert(schema.transDetail).values(
        lines.map((l) => ({
          fyCode: fyForRow,
          vtype: VTYPE,
          vno,
          srno: l.srno,
          accCode: l.accCode,
          partyCode,
          ccCode: l.ccCode,
          narration: l.narration,
          debit: l.debit,
          credit: l.credit,
          chqNo: l.chqNo,
          chqDate: l.chqDate,
          contNo: l.contNo,
        })),
      );
      return insertedId;
    });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message ?? "";
    if (/UNIQUE|constraint/i.test(msg)) {
      codeExists = true;
    } else {
      throw e;
    }
  }

  if (codeExists) redirect(`/finance/jv?adding=1&error=code_exists`);

  revalidatePath("/finance/jv");
  redirect(`/finance/jv?id=${newId}`);
  } catch (e) {
    const err = e as { message?: string; digest?: string };
    if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
    const thru = parseLockedThroughFromError(err.message ?? "");
    if (thru) redirect(`/finance/jv?error=period_locked&thru=${thru}`);
    throw e;
  }
}

async function deleteVoucher(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  const session = await getSession();
  if (session?.roleName !== "ADMIN") {
    redirect(`/finance/jv?id=${id}&error=forbidden`);
  }

  const rows = await db
    .select()
    .from(schema.transMain)
    .where(eq(schema.transMain.id, id))
    .limit(1);
  const main = rows[0];
  if (!main) redirect("/finance/jv");

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.transDetail)
      .where(
        and(
          eq(schema.transDetail.fyCode, main!.fyCode),
          eq(schema.transDetail.vtype, VTYPE),
          eq(schema.transDetail.vno, main!.vno),
        ),
      );
    await tx.delete(schema.transMain).where(eq(schema.transMain.id, id));
  });

  revalidatePath("/finance/jv");
  redirect("/finance/jv");
}

async function setOkStatus(formData: FormData, value: string | null) {
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;
  const rows = await db
    .select({ fyCode: schema.transMain.fyCode, vno: schema.transMain.vno })
    .from(schema.transMain)
    .where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, VTYPE)))
    .limit(1);
  const main = rows[0];
  if (!main) redirect("/finance/jv");
  await db
    .update(schema.transDetail)
    .set({ statusOk: value })
    .where(
      and(
        eq(schema.transDetail.fyCode, main.fyCode),
        eq(schema.transDetail.vtype, VTYPE),
        eq(schema.transDetail.vno, main.vno),
      ),
    );
  revalidatePath("/finance/jv");
  redirect(`/finance/jv?id=${id}`);
}

async function markOk(formData: FormData) {
  "use server";
  await setOkStatus(formData, "Y");
}

async function clearOk(formData: FormData) {
  "use server";
  await setOkStatus(formData, null);
}

const ERROR_MESSAGES: Record<string, string> = {
  unbalanced:
    "Debit and Credit totals do not match. A journal voucher must balance before it can be saved.",
  code_exists: "V.No already exists. Try again.",
  incomplete:
    "Need at least two lines, every line with an amount must have an account, and totals must be greater than zero.",
  no_fy: "No current fiscal year set in Company Profile. Cannot save vouchers.",
  forbidden: "Only ADMIN can delete vouchers.",
  period_locked: "Period is locked. Cannot save vouchers for this date.",
};

export default async function JournalVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    adding?: string;
    error?: string;
    find?: string;
    thru?: string;
  }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";
  const findFilter = params.find?.trim() ?? "";
  const escFind = findFilter ? escapeLike(findFilter) : "";
  const pat = escFind ? `%${escFind}%` : "";

  const session = await getSession();

  const profile = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const currentFy = profile[0]?.currentFy ?? null;

  const accounts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);
  const accByCode = new Map(accounts.map((a) => [a.code, a]));
  const pickerAccounts = accounts.filter((a) => a.level >= 4);
  const titleMap: Record<string, { title: string }> = {};
  for (const a of pickerAccounts) {
    titleMap[a.code] = { title: a.description };
    if (a.descShort && !titleMap[a.descShort]) titleMap[a.descShort] = { title: a.description };
  }

  const contractNos = Array.from(
    new Set(
      [
        ...(await db.select({ c: schema.extYarnPurContract.contNo }).from(schema.extYarnPurContract)).map((r) => r.c),
        ...(await db.select({ c: schema.extYarnSalContract.contNo }).from(schema.extYarnSalContract)).map((r) => r.c),
        ...(await db.select({ c: schema.extGreyPurContract.contractNo }).from(schema.extGreyPurContract)).map((r) => r.c),
        ...(await db.select({ c: schema.extGreySalContract.contractNo }).from(schema.extGreySalContract)).map((r) => r.c),
        ...(await db.select({ c: schema.extGreyConvContract.contNo }).from(schema.extGreyConvContract)).map((r) => r.c),
      ].filter(Boolean),
    ),
  ).sort();

  const ccList = await db
    .select({
      code: schema.costCenters.code,
      description: schema.costCenters.description,
    })
    .from(schema.costCenters)
    .orderBy(schema.costCenters.description);
  const ccByCode = new Map(ccList.map((c) => [c.code, c.description]));

  const listConds = [eq(schema.transMain.vtype, VTYPE)];
  if (currentFy) listConds.push(eq(schema.transMain.fyCode, currentFy));
  if (findFilter) {
    listConds.push(
      sql`(CAST(${schema.transMain.vno} AS TEXT) LIKE ${pat} ESCAPE '\\' OR ${schema.transMain.narration} LIKE ${pat} ESCAPE '\\')`,
    );
  }

  const voucherList = await db
    .select({
      id: schema.transMain.id,
      fyCode: schema.transMain.fyCode,
      vno: schema.transMain.vno,
      vdate: schema.transMain.vdate,
      narration: schema.transMain.narration,
      balanceAmount: schema.transMain.balanceAmount,
      drTotal: sql<number>`coalesce(sum(${schema.transDetail.debit}), 0)`,
      crTotal: sql<number>`coalesce(sum(${schema.transDetail.credit}), 0)`,
    })
    .from(schema.transMain)
    .leftJoin(
      schema.transDetail,
      and(
        eq(schema.transDetail.fyCode, schema.transMain.fyCode),
        eq(schema.transDetail.vtype, schema.transMain.vtype),
        eq(schema.transDetail.vno, schema.transMain.vno),
      ),
    )
    .where(and(...listConds))
    .groupBy(schema.transMain.id)
    .orderBy(desc(schema.transMain.id))
    .limit(200);

  const formMainRows = isEditing
    ? await db
        .select()
        .from(schema.transMain)
        .where(eq(schema.transMain.id, idParam))
        .limit(1)
    : [];
  const selectedMain = formMainRows[0] ?? null;
  const formMain = isAdding ? null : selectedMain;

  const detailLines = formMain
    ? await db
        .select()
        .from(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.fyCode, formMain.fyCode),
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, formMain.vno),
          ),
        )
        .orderBy(schema.transDetail.srno)
    : [];

  const initialDr = detailLines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const initialCr = detailLines.reduce((s, l) => s + (l.credit ?? 0), 0);

  const maxVnoRows = currentFy
    ? await db
        .select({ m: sql<number>`coalesce(max(${schema.transMain.vno}), 0)` })
        .from(schema.transMain)
        .where(
          and(
            eq(schema.transMain.fyCode, currentFy),
            eq(schema.transMain.vtype, VTYPE),
          ),
        )
    : [{ m: 0 }];
  const upcomingVno = (maxVnoRows[0]?.m ?? 0) + 1;

  const countConds = [eq(schema.transMain.vtype, VTYPE)];
  if (currentFy) countConds.push(eq(schema.transMain.fyCode, currentFy));
  const jvCountRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.transMain)
    .where(and(...countConds));
  const jvCount = jvCountRows[0]?.c ?? 0;

  const showForm = !!formMain || isAdding;
  const rowsToShow = Math.max(LINE_ROWS, detailLines.length + 2);
  const lvDisplay = maxVnoRows[0]?.m ?? 0;

  const fmt = (n?: number | null) =>
    n == null
      ? ""
      : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);
  const fmtInt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  const roCls = "input-box mono bg-gray-100";
  const cell = "input-box mono text-[12px]";
  const cellNum = "input-box mono text-[12px] text-right";

  return (
    <Shell active="fin-jv">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">JOURNAL VOUCHERS (WVG)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {jvCount} voucher{jvCount === 1 ? "" : "s"}
              {currentFy ? ` · FY ${currentFy}` : ""}
              {findFilter ? ` · matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={voucherList.map((v) => ({
              vno: v.vno,
              vdate: v.vdate,
              narration: v.narration,
              drTotal: v.drTotal,
              crTotal: v.crTotal,
              balanceAmount: v.balanceAmount,
            }))}
            columns={[
              { key: "vno", label: "V.No" },
              { key: "vdate", label: "Date" },
              { key: "narration", label: "Narration" },
              { key: "drTotal", label: "Dr Total" },
              { key: "crTotal", label: "Cr Total" },
              { key: "balanceAmount", label: "Balance" },
            ]}
            filename="journal-vouchers"
            sheetName="JournalVouchers"
          />
        </div>

        {params.error && ERROR_MESSAGES[params.error] && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {ERROR_MESSAGES[params.error]}
            {params.error === "period_locked" && params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
          </div>
        )}

        {!currentFy && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            No current fiscal year is configured in Company Profile. Set one before creating vouchers.
          </div>
        )}

        <datalist id="jv-acc-short">
          {pickerAccounts
            .filter((a) => a.descShort)
            .map((a) => (
              <option key={a.code} value={a.descShort as string}>
                {a.code} — {a.description}
              </option>
            ))}
          {pickerAccounts
            .filter((a) => !a.descShort)
            .map((a) => (
              <option key={a.code} value={a.code}>
                {a.description}
              </option>
            ))}
        </datalist>
        <datalist id="jv-contracts">
          {contractNos.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="jv-costcenters">
          {ccList.map((c) => (
            <option key={c.code} value={c.description}>
              {c.code}
            </option>
          ))}
        </datalist>
        <RowAutoFill watch="short_name" map={titleMap} />

        <form
          id="jv-find-form"
          method="GET"
          action="/finance/jv"
          className="hidden"
        ></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — Journal Voucher"
                : formMain
                ? `Edit — JV #${formMain.vno}`
                : "Journal Voucher"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/finance/jv?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              {showForm && (
                <button type="submit" form="jv-save-form" className="btn btn-sm">
                  Save
                </button>
              )}
              <PrintButton label="Print" />
              {formMain && session?.roleName === "ADMIN" && (
                <form action={deleteVoucher} className="inline">
                  <input type="hidden" name="id" value={formMain.id} />
                  <ConfirmButton message="Delete this voucher? This cannot be undone.">
                    Delete
                  </ConfirmButton>
                </form>
              )}
              <a href="/finance/jv" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          {showForm ? (
            <form id="jv-save-form" action={saveVoucher}>
              {formMain && (
                <input type="hidden" name="id" value={formMain.id} />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Date</label>
                  <input
                    name="v_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formMain?.vdate ?? today()}
                    required
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Time</label>
                  <input
                    className={roCls}
                    defaultValue={formMain?.vtime ?? nowTime()}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-2 flex items-end gap-2">
                  {formMain ? (
                    <>
                      <button
                        formAction={markOk}
                        className="btn btn-outline btn-sm flex-1"
                        title="Mark all lines OK"
                      >
                        OK
                      </button>
                      <button
                        formAction={clearOk}
                        className="btn btn-outline btn-sm flex-1"
                        title="Clear OK on all lines"
                      >
                        Clear-OK
                      </button>
                    </>
                  ) : (
                    <a
                      href="/finance/jv?adding=1"
                      className="btn btn-outline btn-sm w-full"
                      title="Clear and start a new voucher"
                    >
                      Clear-OK
                    </a>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">V. No</label>
                  <input
                    className={roCls}
                    defaultValue={formMain?.vno ?? upcomingVno}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">LV.No</label>
                  <input
                    className={roCls + " text-center"}
                    defaultValue={lvDisplay}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Find</label>
                  <div className="flex gap-2">
                    <input
                      form="jv-find-form"
                      name="find"
                      className="input-box mono flex-1"
                      defaultValue={params.find ?? ""}
                      placeholder="V.No / Narration"
                    />
                    <button
                      form="jv-find-form"
                      type="submit"
                      className="btn btn-outline btn-sm"
                    >
                      Go
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <label className="label block mb-1">Due Date</label>
                  <input
                    name="due_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formMain?.dueDate ?? ""}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Exp.Date</label>
                  <input
                    name="exp_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formMain?.expDate ?? ""}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Trn.Type</label>
                  <select
                    name="trn_type"
                    className="input-box mono"
                    defaultValue={formMain?.trnType ?? ""}
                  >
                    {TRN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t || "—"}
                      </option>
                    ))}
                    {formMain?.trnType &&
                      !TRN_TYPES.includes(formMain.trnType) && (
                        <option value={formMain.trnType}>
                          {formMain.trnType}
                        </option>
                      )}
                  </select>
                </div>
                <div className="lg:col-span-6">
                  <label className="label block mb-1">Narration</label>
                  <input
                    name="narration"
                    className="input-box"
                    defaultValue={formMain?.narration ?? ""}
                    placeholder="Voucher narration"
                  />
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                  Voucher Lines — enter Dr and Cr on each line (must balance)
                </div>
                <div className="overflow-x-auto border border-black">
                  <table className="mono text-[12px]" style={{ minWidth: 1500 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Sr#</th>
                        <th style={{ width: 140 }}>Short Name</th>
                        <th style={{ width: 240 }}>Tittle</th>
                        <th style={{ width: 34 }}>OK</th>
                        <th style={{ width: 200 }}>Narr</th>
                        <th style={{ width: 100 }}>Chq.No</th>
                        <th style={{ width: 140 }}>Chq.Date</th>
                        <th style={{ width: 120 }}>Cont.No</th>
                        <th style={{ width: 120 }}>Dr</th>
                        <th style={{ width: 120 }}>Cr</th>
                        <th style={{ width: 190 }}>Cost Center / Jobs (F9)</th>
                        <th style={{ width: 34 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: rowsToShow }).map((_, i) => {
                        const l = detailLines[i];
                        const acc = l ? accByCode.get(l.accCode) : undefined;
                        return (
                          <tr key={l?.id ?? `r-${i}`}>
                            <td className="text-center text-[var(--muted)]">
                              {i + 1}
                            </td>
                            <td>
                              <input
                                name="short_name"
                                list="jv-acc-short"
                                className={cell}
                                defaultValue={acc?.descShort ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="title"
                                className={cell + " bg-gray-50"}
                                defaultValue={
                                  acc?.description ?? l?.accCode ?? ""
                                }
                                readOnly
                                tabIndex={-1}
                              />
                            </td>
                            <td className="text-center text-[10px] text-[var(--muted)]">
                              {l?.statusOk === "Y" ? "✓" : ""}
                            </td>
                            <td>
                              <input
                                name="narr"
                                className={cell}
                                defaultValue={l?.narration ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="chq_no"
                                className={cell}
                                defaultValue={l?.chqNo ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="chq_date"
                                type="date"
                                className={cell}
                                defaultValue={l?.chqDate ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="cont_no"
                                list="jv-contracts"
                                className={cell}
                                defaultValue={l?.contNo ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="dr"
                                type="number"
                                step="any"
                                className={cellNum}
                                defaultValue={
                                  l && l.debit ? l.debit : ""
                                }
                              />
                            </td>
                            <td>
                              <input
                                name="cr"
                                type="number"
                                step="any"
                                className={cellNum}
                                defaultValue={
                                  l && l.credit ? l.credit : ""
                                }
                              />
                            </td>
                            <td>
                              <input
                                name="cc"
                                list="jv-costcenters"
                                className={cell}
                                defaultValue={
                                  l?.ccCode != null
                                    ? ccByCode.get(l.ccCode) ??
                                      String(l.ccCode)
                                    : ""
                                }
                              />
                            </td>
                            <td className="text-center">
                              <RowClearButton />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-2">
                  Short Name / Tittle map to the Chart of Accounts (F9). Empty
                  lines are ignored. Any line with a Dr or Cr must name an
                  account.
                </div>
              </div>

              <div className="flex items-end gap-3 mt-6 flex-wrap">
                <div className="no-print">
                  <label className="label block mb-1">Password</label>
                  <input
                    type="password"
                    name="password"
                    className="input-box mono"
                    placeholder="password"
                    style={{ maxWidth: 150 }}
                  />
                </div>
                <div className="flex gap-2 no-print">
                  <a
                    href="/finance/jv?adding=1"
                    className="btn btn-outline btn-sm"
                  >
                    New
                  </a>
                  <button type="submit" className="btn btn-sm">
                    Save
                  </button>
                  <PrintButton label="Print" />
                  <a href="/finance/jv" className="btn btn-outline btn-sm">
                    Exit
                  </a>
                </div>
                <div className="ml-auto">
                  <JvBalanceBar initialDr={initialDr} initialCr={initialCr} />
                </div>
              </div>
            </form>
          ) : (
            <div className="text-[13px] text-[var(--muted)] py-6 text-center">
              Select a voucher from the list below, or click <b>New</b> to create
              one.
            </div>
          )}
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold flex items-center justify-between">
            <span>Journal Vouchers</span>
            {findFilter && (
              <a href="/finance/jv" className="btn btn-outline btn-sm">
                Clear Search
              </a>
            )}
          </div>
          <div
            className="overflow-x-auto"
            style={{ maxHeight: "60vh", overflowY: "auto" }}
          >
            <table>
              <thead>
                <tr>
                  <th>V. No</th>
                  <th>Date</th>
                  <th>Narration</th>
                  <th className="text-right">Dr Total</th>
                  <th className="text-right">Cr Total</th>
                </tr>
              </thead>
              <tbody>
                {voucherList.map((v) => {
                  const isSel = v.id === selectedMain?.id;
                  const href = `/finance/jv?id=${v.id}`;
                  const linkStyle = {
                    color: isSel ? "white" : "inherit",
                  } as const;
                  return (
                    <tr
                      key={v.id}
                      className={
                        isSel
                          ? "bg-black text-white"
                          : "cursor-pointer hover:bg-gray-50"
                      }
                    >
                      <td className="mono font-bold">
                        <a
                          href={href}
                          className="no-underline block"
                          style={linkStyle}
                        >
                          {v.vno}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a
                          href={href}
                          className="no-underline block"
                          style={linkStyle}
                        >
                          {v.vdate}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a
                          href={href}
                          className="no-underline block"
                          style={linkStyle}
                        >
                          {v.narration ?? "-"}
                        </a>
                      </td>
                      <td className="text-right mono">
                        <a
                          href={href}
                          className="no-underline block"
                          style={linkStyle}
                        >
                          {fmtInt(v.drTotal ?? 0)}
                        </a>
                      </td>
                      <td className="text-right mono">
                        <a
                          href={href}
                          className="no-underline block"
                          style={linkStyle}
                        >
                          {fmtInt(v.crTotal ?? 0)}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {voucherList.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center text-[13px] text-[var(--muted)] py-6"
                    >
                      No journal vouchers. Click <b>New</b> above to create one.
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
