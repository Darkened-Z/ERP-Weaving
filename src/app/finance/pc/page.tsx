import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { RowClearButton } from "@/components/row-clear-button";
import { Combobox } from "@/components/combobox";
import { RowAutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { VoucherBalance } from "@/components/voucher-balance";
import { db, schema } from "@/db";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { today, nowTime } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const VTYPE = "PC";
const BASE = "/finance/pc";
const TITLE = "PETTY  CASH (WVG)";
const AMOUNT_LABEL = "Dr";
const IS_RECEIPT = false;
const GRID_ROWS = 18;

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

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

const fmt = (n?: number | null) =>
  n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

type GridLine = {
  acc: string;
  narr: string | null;
  chqNo: string | null;
  chqDate: string | null;
  yarn: string | null;
  cc: number | null;
  amount: number;
};

function buildDetails(fyCode: string, vno: number, pettyAcc: string, lines: GridLine[]) {
  const rows: (typeof schema.transDetail.$inferInsert)[] = lines.map((l, i) => ({
    fyCode,
    vtype: VTYPE,
    vno,
    srno: i + 1,
    accCode: l.acc,
    partyCode: pettyAcc,
    ccCode: l.cc,
    narration: l.narr,
    debit: IS_RECEIPT ? 0 : l.amount,
    credit: IS_RECEIPT ? l.amount : 0,
    chqNo: l.chqNo,
    chqDate: l.chqDate,
    yarnCount: l.yarn,
  }));
  lines.forEach((l, i) => {
    const chq = l.chqNo ? ` CHQ.#: ${l.chqNo}${l.chqDate ? " DT." + l.chqDate : ""}` : "";
    rows.push({
      fyCode,
      vtype: VTYPE,
      vno,
      srno: (IS_RECEIPT ? 50 : 100) + i,
      accCode: pettyAcc,
      partyCode: pettyAcc,
      ccCode: null,
      narration: ((l.narr ?? "") + chq).trim() || null,
      debit: IS_RECEIPT ? l.amount : 0,
      credit: IS_RECEIPT ? 0 : l.amount,
      chqNo: null,
      chqDate: null,
    });
  });
  const sumD = rows.reduce((s, r) => s + (r.debit ?? 0), 0);
  const sumC = rows.reduce((s, r) => s + (r.credit ?? 0), 0);
  if (Math.abs(sumD - sumC) > 0.001) {
    throw new Error("Unbalanced voucher: debit and credit totals differ");
  }
  return rows;
}

async function saveVoucher(formData: FormData) {
  "use server";
  try {
  const session = await getSession();
  const utCode = session?.userId ?? null;
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const editing = Number.isFinite(id) && id > 0;
  const back = editing ? `id=${id}` : "adding=1";

  const pettyAcc = txt(formData.get("acc_code"));
  const vdate = ((formData.get("v_date") as string) || "").trim() || today();
  await assertPeriodOpen(vdate, "FINANCE");
  const vtime = txt(formData.get("v_time")) ?? nowTime();
  const narration = txt(formData.get("narration")) ?? "PETTY CASH PAYMENT";

  const accsArr = formData.getAll("line_acc") as string[];
  const narrArr = formData.getAll("line_narr") as string[];
  const chqNoArr = formData.getAll("line_chq_no") as string[];
  const chqDateArr = formData.getAll("line_chq_date") as string[];
  const yarnArr = formData.getAll("line_yarn") as string[];
  const ccArr = formData.getAll("line_cc") as string[];
  const amtArr = formData.getAll("line_amount") as string[];

  const rowCount = Math.max(accsArr.length, amtArr.length);
  const lines: GridLine[] = [];
  for (let i = 0; i < rowCount; i++) {
    const acc = (accsArr[i] ?? "").trim();
    const amount = num(amtArr[i]);
    if (!acc || amount === null || amount <= 0) continue;
    lines.push({
      acc,
      narr: txt(narrArr[i]),
      chqNo: txt(chqNoArr[i]),
      chqDate: txt(chqDateArr[i]),
      yarn: txt(yarnArr[i]),
      cc: intVal(ccArr[i]),
      amount,
    });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);

  if (!pettyAcc || lines.length === 0 || total <= 0) {
    redirect(`${BASE}?${back}&error=invalid`);
  }

  const cpRows = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const currentFy = cpRows[0]?.fy ?? null;
  if (!currentFy) {
    redirect(`${BASE}?${back}&error=no_fy`);
  }

  if (editing) {
    await db.transaction(async (tx) => {
      const ex = await tx
        .select({ fyCode: schema.transMain.fyCode, vno: schema.transMain.vno })
        .from(schema.transMain)
        .where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, VTYPE)))
        .limit(1);
      if (!ex.length) return;
      const exFy = ex[0].fyCode;
      const vno = ex[0].vno;
      await tx
        .update(schema.transMain)
        .set({ vdate, vtime, accCode: pettyAcc, narration, balanceAmount: total, utCode })
        .where(eq(schema.transMain.id, id));
      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.fyCode, exFy),
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, vno),
          ),
        );
      await tx
        .insert(schema.transDetail)
        .values(buildDetails(exFy, vno, pettyAcc!, lines));
    });
    revalidatePath(BASE);
    redirect(`${BASE}?id=${id}`);
  }

  let newId = 0;
  let codeExists = false;
  try {
    newId = await db.transaction(async (tx) => {
      const agg = await tx
        .select({ mx: sql<number>`coalesce(max(${schema.transMain.vno}), 0)` })
        .from(schema.transMain)
        .where(and(eq(schema.transMain.fyCode, currentFy!), eq(schema.transMain.vtype, VTYPE)));
      const vno = (agg[0]?.mx ?? 0) + 1;
      const inserted = await tx
        .insert(schema.transMain)
        .values({
          fyCode: currentFy!,
          vtype: VTYPE,
          vno,
          vdate,
          vtime,
          accCode: pettyAcc!,
          narration,
          balanceAmount: total,
          utCode,
        })
        .returning({ id: schema.transMain.id });
      const mainId = inserted[0].id;
      await tx
        .insert(schema.transDetail)
        .values(buildDetails(currentFy!, vno, pettyAcc!, lines));
      return mainId;
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
    redirect(`${BASE}?adding=1&error=code_exists`);
  }
  revalidatePath(BASE);
  redirect(`${BASE}?id=${newId}`);
  } catch (e) {
    const err = e as { message?: string; digest?: string };
    if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
    const thru = parseLockedThroughFromError(err.message ?? "");
    if (thru) redirect(`${BASE}?error=period_locked&thru=${thru}`);
    throw e;
  }
}

async function deleteVoucher(formData: FormData) {
  "use server";
  const session = await getSession();
  if (session?.roleName !== "ADMIN") redirect(`${BASE}?error=admin_only`);
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) return;
  await db.transaction(async (tx) => {
    const ex = await tx
      .select({ fyCode: schema.transMain.fyCode, vno: schema.transMain.vno })
      .from(schema.transMain)
      .where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, VTYPE)))
      .limit(1);
    if (!ex.length) return;
    await tx
      .delete(schema.transDetail)
      .where(
        and(
          eq(schema.transDetail.fyCode, ex[0].fyCode),
          eq(schema.transDetail.vtype, VTYPE),
          eq(schema.transDetail.vno, ex[0].vno),
        ),
      );
    await tx.delete(schema.transMain).where(eq(schema.transMain.id, id));
  });
  revalidatePath(BASE);
  redirect(BASE);
}

async function setOkStatus(formData: FormData) {
  "use server";
  const id = intVal(formData.get("id"));
  if (id === null) return;
  const [main] = await db
    .select()
    .from(schema.transMain)
    .where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, VTYPE)))
    .limit(1);
  if (!main) redirect(BASE);
  await db
    .update(schema.transDetail)
    .set({ statusOk: formData.get("ok") ? "OK" : null })
    .where(
      and(
        eq(schema.transDetail.fyCode, main.fyCode),
        eq(schema.transDetail.vtype, VTYPE),
        eq(schema.transDetail.vno, main.vno),
      ),
    );
  revalidatePath(BASE);
  redirect(`${BASE}?id=${id}`);
}

export default async function PettyCashPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";
  const findFilter = params.find?.trim() ?? "";

  const accounts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
    })
    .from(schema.chartOfAccounts)
    .where(gte(schema.chartOfAccounts.level, 4))
    .orderBy(schema.chartOfAccounts.code);
  const acctMap = new Map(accounts.map((a) => [a.code, a.description]));
  const accOpts = accounts.map((a) => ({
    value: a.code,
    label: `${a.code} — ${a.description}`,
    desc: a.description,
  }));
  const accDescMap = Object.fromEntries(
    accounts.map((a) => [a.code, { line_title: a.description }]),
  );

  const centers = await db
    .select({ code: schema.costCenters.code, description: schema.costCenters.description })
    .from(schema.costCenters)
    .orderBy(schema.costCenters.code);
  const yarnList = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.countCode);

  const cp = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = cp[0]?.fy ?? null;

  const scope = fyCode
    ? and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.fyCode, fyCode))
    : eq(schema.transMain.vtype, VTYPE);

  const agg = await db
    .select({
      mx: sql<number>`coalesce(max(${schema.transMain.vno}), 0)`,
      cnt: sql<number>`count(*)`,
    })
    .from(schema.transMain)
    .where(scope);
  const lastVno = agg[0]?.mx ?? 0;
  const voucherCount = agg[0]?.cnt ?? 0;
  const upcomingVno = lastVno + 1;

  const esc = escapeLike(findFilter);
  const pat = `%${esc}%`;
  const listWhere = and(
    eq(schema.transMain.vtype, VTYPE),
    fyCode ? eq(schema.transMain.fyCode, fyCode) : undefined,
    findFilter
      ? sql`(CAST(${schema.transMain.vno} AS TEXT) LIKE ${pat} ESCAPE '\\' OR ${schema.transMain.narration} LIKE ${pat} ESCAPE '\\')`
      : undefined,
  );
  const vouchers = await db
    .select({
      id: schema.transMain.id,
      vno: schema.transMain.vno,
      vdate: schema.transMain.vdate,
      narration: schema.transMain.narration,
      balanceAmount: schema.transMain.balanceAmount,
    })
    .from(schema.transMain)
    .where(listWhere)
    .orderBy(desc(schema.transMain.vno))
    .limit(200);

  const selectedRows = isEditing
    ? await db
        .select()
        .from(schema.transMain)
        .where(and(eq(schema.transMain.id, idParam), eq(schema.transMain.vtype, VTYPE)))
        .limit(1)
    : [];
  const selected = selectedRows[0] ?? null;
  const formVoucher = isAdding ? null : selected;

  const details = formVoucher
    ? await db
        .select()
        .from(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.fyCode, formVoucher.fyCode),
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, formVoucher.vno),
          ),
        )
        .orderBy(schema.transDetail.srno)
    : [];
  const gridLines = details.filter(
    (d) => d.srno < 100 && (IS_RECEIPT ? (d.credit ?? 0) > 0 : (d.debit ?? 0) > 0),
  );

  const showForm = !!formVoucher || isAdding;
  const rowsToShow = Math.max(GRID_ROWS, gridLines.length + 3);
  const balanceAmount = formVoucher?.balanceAmount ?? 0;

  const errorMessage =
    params.error === "code_exists"
      ? "V.No already exists. Try again."
      : params.error === "invalid"
      ? "Enter the petty cash account and at least one line with an amount."
      : params.error === "no_fy"
      ? "No current fiscal year is set in Company Profile."
      : params.error === "admin_only"
      ? "Only ADMIN can delete vouchers."
      : params.error === "period_locked"
      ? `Period is locked. Cannot save vouchers for this date${params.thru ? ` — locked through ${params.thru}` : ""}.`
      : null;

  return (
    <Shell active="fin-pc">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">{TITLE}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {voucherCount} voucher{voucherCount === 1 ? "" : "s"}
              {fyCode ? ` — FY ${fyCode}` : ""}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={vouchers.map((v) => ({
              vno: v.vno,
              vdate: v.vdate,
              narration: v.narration,
              amount: v.balanceAmount,
            }))}
            columns={[
              { key: "vno", label: "V.No" },
              { key: "vdate", label: "Date" },
              { key: "narration", label: "Narration" },
              { key: "amount", label: "Amount" },
            ]}
            filename="petty-cash-payments"
            sheetName="PettyCashPayments"
          />
        </div>

        {errorMessage && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {errorMessage}
          </div>
        )}

        <datalist id="fin-ccs">
          {centers.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.description}
            </option>
          ))}
        </datalist>
        <datalist id="fin-yarns">
          {yarnList.map((y) => (
            <option key={y.countCode} value={y.countCode}>
              {y.description ? `${y.countCode} — ${y.description}` : y.countCode}
            </option>
          ))}
        </datalist>

        <form id="pc-find-form" method="GET" action={BASE} className="hidden"></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? `New — ${TITLE}`
                : formVoucher
                ? `Edit — V.No ${formVoucher.vno}`
                : TITLE}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              {formVoucher && (
                <>
                  <form action={setOkStatus} className="inline">
                    <input type="hidden" name="id" value={formVoucher.id} />
                    <input type="hidden" name="ok" value="1" />
                    <button type="submit" className="btn btn-outline btn-sm">
                      OK
                    </button>
                  </form>
                  <form action={setOkStatus} className="inline">
                    <input type="hidden" name="id" value={formVoucher.id} />
                    <button type="submit" className="btn btn-outline btn-sm">
                      Clear-OK
                    </button>
                  </form>
                </>
              )}
              <a href={`${BASE}?adding=1`} className="btn btn-outline btn-sm">
                New
              </a>
              {showForm && (
                <button type="submit" form="pc-save-form" className="btn btn-sm">
                  Save
                </button>
              )}
              <PrintButton label="Print" />
              {formVoucher && (
                <form action={deleteVoucher} className="inline">
                  <input type="hidden" name="id" value={formVoucher.id} />
                  <ConfirmButton message="Delete this voucher? This cannot be undone.">
                    Delete
                  </ConfirmButton>
                </form>
              )}
              <a href={BASE} className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          {showForm ? (
            <form id="pc-save-form" action={saveVoucher}>
              {formVoucher && <input type="hidden" name="id" value={formVoucher.id} />}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Date</label>
                  <input
                    name="v_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formVoucher?.vdate ?? today()}
                    required
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Acc.Code</label>
                  <Combobox
                    name="acc_code"
                    options={accOpts}
                    defaultValue={formVoucher?.accCode ?? ""}
                    placeholder="Petty cash account"
                    descTargetId="pc-acc-title"
                  />
                </div>
                <div className="lg:col-span-4">
                  <label className="label block mb-1">Tittle</label>
                  <input
                    id="pc-acc-title"
                    className="input-box mono bg-gray-100"
                    defaultValue={
                      formVoucher?.accCode ? acctMap.get(formVoucher.accCode) ?? "" : ""
                    }
                    readOnly
                    tabIndex={-1}
                    placeholder="Account description"
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="label block mb-1">Time</label>
                  <input
                    name="v_time"
                    className="input-box mono bg-gray-100 text-center"
                    defaultValue={formVoucher?.vtime ?? nowTime()}
                    readOnly
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="label block mb-1">V. No</label>
                  <input
                    className="input-box mono bg-gray-100 text-center"
                    defaultValue={formVoucher?.vno ?? upcomingVno}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="label block mb-1">LV.No</label>
                  <input
                    className="input-box mono bg-gray-100 text-center"
                    defaultValue={lastVno}
                    readOnly
                    tabIndex={-1}
                  />
                </div>

                <div className="lg:col-span-8">
                  <label className="label block mb-1">Narration</label>
                  <input
                    name="narration"
                    className="input-box mono"
                    defaultValue={formVoucher?.narration ?? ""}
                  />
                </div>
                <div className="lg:col-span-4">
                  <label className="label block mb-1">Find</label>
                  <div className="flex gap-2">
                    <input
                      form="pc-find-form"
                      name="find"
                      className="input-box mono flex-1"
                      defaultValue={params.find ?? ""}
                      placeholder="V.No / Narration"
                    />
                    <button form="pc-find-form" type="submit" className="btn btn-outline btn-sm">
                      Find
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                  Line Items
                </div>
                <RowAutoFill watch="line_acc" map={accDescMap} />
                <div className="overflow-x-auto border border-black">
                  <table className="mono text-[12px]" style={{ minWidth: 1450 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Sr#</th>
                        <th style={{ width: 200 }}>Account (F9)</th>
                        <th style={{ width: 220 }}>Tittle</th>
                        <th style={{ width: 40 }}>OK</th>
                        <th style={{ width: 130 }}>Yarn Count - (List - F9)</th>
                        <th style={{ width: 240 }}>Narr</th>
                        <th style={{ width: 110 }}>Chq.No</th>
                        <th style={{ width: 130 }}>Chq.Date</th>
                        <th style={{ width: 120 }}>{AMOUNT_LABEL}</th>
                        <th style={{ width: 150 }}>Cost Center / Jobs (F9)</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: rowsToShow }).map((_, i) => {
                        const l = gridLines[i];
                        return (
                          <tr key={i}>
                            <td className="text-[var(--muted)] text-center">{i + 1}</td>
                            <td>
                              <Combobox
                                name="line_acc"
                                options={accOpts}
                                defaultValue={l?.accCode ?? ""}
                                className="input-box mono text-[12px]"
                              />
                            </td>
                            <td>
                              <input
                                className="input-box mono text-[12px] bg-gray-100"
                                defaultValue={l ? acctMap.get(l.accCode) ?? "" : ""}
                                readOnly
                                tabIndex={-1}
                              />
                            </td>
                            <td className="text-center text-[10px] text-[var(--muted)]">
                              {l?.statusOk === "OK" ? "OK" : ""}
                            </td>
                            <td>
                              <input
                                name="line_yarn"
                                list="fin-yarns"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.yarnCount ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_narr"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.narration ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_chq_no"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.chqNo ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_chq_date"
                                type="date"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.chqDate ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_amount"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px] text-right"
                                defaultValue={
                                  l ? (IS_RECEIPT ? l.credit ?? "" : l.debit ?? "") : ""
                                }
                              />
                            </td>
                            <td>
                              <input
                                name="line_cc"
                                list="fin-ccs"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.ccCode ?? ""}
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
              </div>

              <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">
                  Save
                </button>
                <a href={`${BASE}?adding=1`} className="btn btn-outline btn-sm">
                  New
                </a>
                <PrintButton label="Print" />
                <a href={BASE} className="btn btn-outline btn-sm">
                  Exit
                </a>
                <div className="ml-auto flex items-end gap-3 flex-wrap">
                  <div className="w-44">
                    <label className="label block mb-1">Balance Amount</label>
                    <VoucherBalance initial={balanceAmount} fieldName="line_amount" />
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <div className="text-[13px] text-[var(--muted)] py-6 text-center">
              Select a voucher from the list below, or click <b>New</b> to create one.
            </div>
          )}
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Vouchers
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V. No</th>
                  <th>Date</th>
                  <th>Narration</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const isSel = v.id === selected?.id;
                  const href = `${BASE}?id=${v.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr
                      key={v.id}
                      className={
                        isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"
                      }
                    >
                      <td className="mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.vno}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.vdate}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.narration ?? "-"}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {fmt(v.balanceAmount)}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {vouchers.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center text-[13px] text-[var(--muted)] py-6"
                    >
                      No vouchers. Click <b>New</b> above to create one.
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
