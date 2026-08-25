import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { RowClearButton } from "@/components/row-clear-button";
import { VoucherBalance } from "@/components/voucher-balance";
import { Combobox } from "@/components/combobox";
import { RowAutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { and, eq, sql, desc, gte, inArray, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { today, nowTime } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const VTYPE = "BP";
const BASE = "/finance/bp";
const TITLE = "BANK PAYMENT S (WVG)";
const IS_RECEIPT = false;
const AMOUNT_LABEL = "Dr";
const LINE_ROWS = 12;
const CONTRA_BASE = 100;

const TRN_TYPES = [
  "CHEQUE",
  "ONLINE TRANSFER",
  "PAY ORDER",
  "DEMAND DRAFT",
  "CASH DEPOSIT",
  "RTGS",
];

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
const formatNum = (n?: number | null) =>
  n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

async function saveVoucher(formData: FormData) {
  "use server";
  try {
  const session = await getSession();
  const utCode = session?.userId ?? null;

  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const isEdit = Number.isFinite(id) && id > 0;

  const bankAcc = txt(formData.get("bank_acc"));
  const splitting = formData.get("splitting") ? "Y" : "N";
  const trnType = txt(formData.get("trn_type"));
  const img = txt(formData.get("img"));
  const vdate = txt(formData.get("v_date")) ?? today();
  await assertPeriodOpen(vdate, "FINANCE");
  const vtime = txt(formData.get("v_time")) ?? nowTime();
  const dueDate = txt(formData.get("due_date"));
  const expDate = txt(formData.get("exp_date"));

  const accs = formData.getAll("line_acc") as string[];
  const yarns = formData.getAll("line_yarn") as string[];
  const narrs = formData.getAll("line_narr") as string[];
  const chqNos = formData.getAll("line_chq_no") as string[];
  const chqDates = formData.getAll("line_chq_date") as string[];
  const amounts = formData.getAll("line_amt") as string[];
  const ccs = formData.getAll("line_cc") as string[];

  const rowCount = Math.max(accs.length, amounts.length);
  const postable: {
    accCode: string;
    yarnCount: string | null;
    narration: string | null;
    chqNo: string | null;
    chqDate: string | null;
    ccCode: number | null;
    amount: number;
  }[] = [];

  for (let i = 0; i < rowCount; i++) {
    const accCode = (accs[i] ?? "").trim();
    const amount = num(amounts[i]);
    if (!accCode || amount === null || amount <= 0) continue;
    postable.push({
      accCode,
      yarnCount: (yarns[i] ?? "").trim() || null,
      narration: (narrs[i] ?? "").trim() || null,
      chqNo: (chqNos[i] ?? "").trim() || null,
      chqDate: (chqDates[i] ?? "").trim() || null,
      ccCode: intVal(ccs[i]),
      amount,
    });
  }

  const total = postable.reduce((s, l) => s + l.amount, 0);

  const ctx = isEdit ? `id=${id}` : "adding=1";

  if (!bankAcc || postable.length < 1 || total <= 0) {
    redirect(`${BASE}?error=invalid&${ctx}`);
  }

  const codes = Array.from(new Set([bankAcc as string, ...postable.map((l) => l.accCode)]));
  const validCodes = await db
    .select({ code: schema.chartOfAccounts.code })
    .from(schema.chartOfAccounts)
    .where(and(inArray(schema.chartOfAccounts.code, codes), gte(schema.chartOfAccounts.level, 4)));
  if (validCodes.length !== codes.length) {
    redirect(`${BASE}?error=bad_account&${ctx}`);
  }

  let editMain: { fyCode: string; vno: number } | null = null;
  if (isEdit) {
    const rows = await db
      .select({ fyCode: schema.transMain.fyCode, vno: schema.transMain.vno })
      .from(schema.transMain)
      .where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, VTYPE)));
    editMain = rows[0] ?? null;
    if (!editMain) redirect(BASE);
  }

  const chqList = postable.map((l) => l.chqNo).filter((c): c is string => !!c);
  if (chqList.length) {
    const dupRows = await db
      .select({ fyCode: schema.transDetail.fyCode, vno: schema.transDetail.vno })
      .from(schema.transDetail)
      .where(and(eq(schema.transDetail.vtype, VTYPE), inArray(schema.transDetail.chqNo, chqList)));
    const clash = dupRows.some(
      (d) => !editMain || d.fyCode !== editMain.fyCode || d.vno !== editMain.vno,
    );
    if (clash) redirect(`${BASE}?error=dup_chq&${ctx}`);
  }

  const nowIso = new Date().toISOString();

  const buildDetails = (
    fyCode: string,
    vno: number,
  ): (typeof schema.transDetail.$inferInsert)[] => {
    const rows: (typeof schema.transDetail.$inferInsert)[] = postable.map((l, i) => ({
      fyCode,
      vtype: VTYPE,
      vno,
      srno: i + 1,
      accCode: l.accCode,
      partyCode: bankAcc,
      ccCode: l.ccCode,
      narration: l.narration,
      debit: IS_RECEIPT ? 0 : l.amount,
      credit: IS_RECEIPT ? l.amount : 0,
      chqNo: l.chqNo,
      chqDate: l.chqDate,
      yarnCount: l.yarnCount,
    }));
    if (splitting === "Y") {
      const narr = postable
        .filter((l) => l.chqNo)
        .map((l) => `CHQ.#:${l.chqNo}${l.chqDate ? ` DT:${l.chqDate}` : ""}`)
        .join(" ");
      rows.push({
        fyCode,
        vtype: VTYPE,
        vno,
        srno: CONTRA_BASE + 1,
        accCode: bankAcc as string,
        partyCode: bankAcc,
        debit: IS_RECEIPT ? total : 0,
        credit: IS_RECEIPT ? 0 : total,
        narration: narr || null,
      });
    } else {
      postable.forEach((l, i) => {
        const narr = `${l.narration ?? ""}${
          l.chqNo ? ` CHQ.#: ${l.chqNo}${l.chqDate ? ` DT.${l.chqDate}` : ""}` : ""
        }`.trim();
        rows.push({
          fyCode,
          vtype: VTYPE,
          vno,
          srno: CONTRA_BASE + i + 1,
          accCode: bankAcc as string,
          partyCode: bankAcc,
          debit: IS_RECEIPT ? l.amount : 0,
          credit: IS_RECEIPT ? 0 : l.amount,
          narration: narr || null,
        });
      });
    }
    return rows;
  };

  const assertBalanced = (rows: (typeof schema.transDetail.$inferInsert)[]) => {
    const d = rows.reduce((s, r) => s + (r.debit ?? 0), 0);
    const c = rows.reduce((s, r) => s + (r.credit ?? 0), 0);
    if (Math.abs(d - c) > 0.01) throw new Error("Voucher not balanced");
  };

  if (isEdit) {
    await db.transaction(async (tx) => {
      const ex = editMain!;
      await tx
        .update(schema.transMain)
        .set({
          vdate,
          vtime,
          accCode: bankAcc,
          dueDate,
          expDate,
          trnType,
          img,
          splitting,
          balanceAmount: total,
          vdateModified: nowIso,
          utCode,
        })
        .where(eq(schema.transMain.id, id));
      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.fyCode, ex.fyCode),
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, ex.vno),
          ),
        );
      const rows = buildDetails(ex.fyCode, ex.vno);
      assertBalanced(rows);
      await tx.insert(schema.transDetail).values(rows);
    });
    revalidatePath(BASE);
    redirect(`${BASE}?id=${id}`);
  }

  const [company] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  if (!company?.currentFy) {
    redirect(`${BASE}?error=no_fy&adding=1`);
  }
  const fyCode = company.currentFy;

  let newId = 0;
  let codeExists = false;
  try {
    newId = await db.transaction(async (tx) => {
      const [maxRow] = await tx
        .select({ max: sql<number>`coalesce(max(vno), 0)` })
        .from(schema.transMain)
        .where(and(eq(schema.transMain.fyCode, fyCode), eq(schema.transMain.vtype, VTYPE)));
      const vno = (maxRow?.max ?? 0) + 1;

      const inserted = await tx
        .insert(schema.transMain)
        .values({
          fyCode,
          vtype: VTYPE,
          vno,
          vdate,
          vtime,
          accCode: bankAcc,
          narration: null,
          dueDate,
          expDate,
          trnType,
          img,
          splitting,
          balanceAmount: total,
          utCode,
        })
        .returning({ id: schema.transMain.id });
      const insertedId = inserted[0].id;

      const rows = buildDetails(fyCode, vno);
      assertBalanced(rows);
      await tx.insert(schema.transDetail).values(rows);
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

  if (codeExists) {
    redirect(`${BASE}?error=code_exists&adding=1`);
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
  const id = intVal(formData.get("id"));
  if (id === null) return;
  const session = await getSession();
  if (session?.roleName !== "ADMIN") {
    redirect(`${BASE}?error=forbidden&id=${id}`);
  }
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ fyCode: schema.transMain.fyCode, vno: schema.transMain.vno })
      .from(schema.transMain)
      .where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, VTYPE)));
    const ex = existing[0];
    if (!ex) return;
    await tx
      .delete(schema.transDetail)
      .where(
        and(
          eq(schema.transDetail.fyCode, ex.fyCode),
          eq(schema.transDetail.vtype, VTYPE),
          eq(schema.transDetail.vno, ex.vno),
        ),
      );
    await tx.delete(schema.transMain).where(eq(schema.transMain.id, id));
  });
  revalidatePath(BASE);
  redirect(BASE);
}

async function setOkStatus(formData: FormData, value: string | null) {
  const id = intVal(formData.get("id"));
  if (id === null) return;
  const [main] = await db
    .select({ fyCode: schema.transMain.fyCode, vno: schema.transMain.vno })
    .from(schema.transMain)
    .where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, VTYPE)));
  if (!main) redirect(BASE);
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
  revalidatePath(BASE);
  redirect(`${BASE}?id=${id}`);
}

async function markOk(formData: FormData) {
  "use server";
  await setOkStatus(formData, "Y");
}

async function clearOk(formData: FormData) {
  "use server";
  await setOkStatus(formData, null);
}

export default async function BankPaymentPage({
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

  const session = await getSession();

  const [company] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.currentFy ?? "";

  const accounts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.code);
  const descMap = new Map(accounts.map((a) => [a.code, a.description]));
  const pickerAccounts = accounts.filter((a) => a.level >= 4);
  const bankOpts = pickerAccounts.map((a) => ({
    value: a.code,
    label: `${a.code} — ${a.description}`,
    desc: a.description,
  }));
  const lineTitleMap = Object.fromEntries(
    pickerAccounts.map((a) => [a.code, { line_title: a.description }]),
  );

  const brCheques = await db
    .select({ chqNo: schema.transDetail.chqNo, chqDate: schema.transDetail.chqDate })
    .from(schema.transDetail)
    .where(and(eq(schema.transDetail.vtype, "BR"), isNotNull(schema.transDetail.chqNo)));
  const usedInBp = new Set(
    (
      await db
        .select({ chqNo: schema.transDetail.chqNo })
        .from(schema.transDetail)
        .where(and(eq(schema.transDetail.vtype, VTYPE), isNotNull(schema.transDetail.chqNo)))
    ).map((r) => r.chqNo),
  );
  const seenChq = new Set<string>();
  const endorsable = brCheques.filter((c) => {
    if (!c.chqNo || usedInBp.has(c.chqNo) || seenChq.has(c.chqNo)) return false;
    seenChq.add(c.chqNo);
    return true;
  });
  const chqDateMap = Object.fromEntries(
    endorsable.map((c) => [c.chqNo as string, { line_chq_date: c.chqDate ?? "" }]),
  );

  const centers = await db
    .select({ code: schema.costCenters.code, description: schema.costCenters.description })
    .from(schema.costCenters)
    .orderBy(schema.costCenters.code);

  const yarnList = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.countCode);

  const filt = "%" + escapeLike(findFilter) + "%";
  const listConds = [eq(schema.transMain.vtype, VTYPE)];
  if (fyCode) listConds.push(eq(schema.transMain.fyCode, fyCode));
  if (findFilter) {
    listConds.push(
      sql`(CAST(${schema.transMain.vno} AS TEXT) LIKE ${filt} ESCAPE '\\' OR ${schema.transMain.accCode} LIKE ${filt} ESCAPE '\\')`,
    );
  }
  const vouchers = await db
    .select({
      id: schema.transMain.id,
      vno: schema.transMain.vno,
      vdate: schema.transMain.vdate,
      vtime: schema.transMain.vtime,
      accCode: schema.transMain.accCode,
      trnType: schema.transMain.trnType,
      balanceAmount: schema.transMain.balanceAmount,
    })
    .from(schema.transMain)
    .where(and(...listConds))
    .orderBy(desc(schema.transMain.vno))
    .limit(200);

  let selected = isEditing ? vouchers.find((v) => v.id === idParam) ?? null : null;
  if (isEditing && !selected) {
    const [row] = await db
      .select({
        id: schema.transMain.id,
        vno: schema.transMain.vno,
        vdate: schema.transMain.vdate,
        vtime: schema.transMain.vtime,
        accCode: schema.transMain.accCode,
        trnType: schema.transMain.trnType,
        balanceAmount: schema.transMain.balanceAmount,
      })
      .from(schema.transMain)
      .where(and(eq(schema.transMain.id, idParam), eq(schema.transMain.vtype, VTYPE)));
    selected = row ?? null;
  }
  const formVoucher = isAdding ? null : selected;

  const headVoucher = formVoucher
    ? await db
        .select()
        .from(schema.transMain)
        .where(eq(schema.transMain.id, formVoucher.id))
        .then((r) => r[0] ?? null)
    : null;

  const detailLines = formVoucher
    ? await db
        .select()
        .from(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.fyCode, headVoucher!.fyCode),
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, formVoucher.vno),
          ),
        )
        .orderBy(schema.transDetail.srno)
    : [];

  const gridDetail = detailLines.filter(
    (l) =>
      (IS_RECEIPT ? (l.credit ?? 0) > 0 : (l.debit ?? 0) > 0) && l.srno < CONTRA_BASE,
  );

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(vno), 0)` })
    .from(schema.transMain)
    .where(and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.fyCode, fyCode)));
  const lastVno = maxRow?.max ?? 0;
  const upcomingVno = lastVno + 1;

  const countConds = [eq(schema.transMain.vtype, VTYPE)];
  if (fyCode) countConds.push(eq(schema.transMain.fyCode, fyCode));
  const [countRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.transMain)
    .where(and(...countConds));
  const totalCount = countRow?.c ?? 0;

  const showForm = !!formVoucher || isAdding;
  const rowsToShow = Math.max(LINE_ROWS, gridDetail.length + 3);

  const bankTitle = headVoucher?.accCode ? descMap.get(headVoucher.accCode) ?? "" : "";

  const ERROR_MESSAGES: Record<string, string> = {
    code_exists: "V.No already exists. Try again.",
    invalid: "Bank account, at least one line, and a positive amount are required.",
    no_fy: "Company fiscal year is not configured.",
    dup_chq: "Cheque number already used on another voucher of this type. Change it and save again.",
    bad_account: "One or more account codes are unknown or not a detail (level 4+) account.",
    forbidden: "Only ADMIN can delete vouchers.",
    period_locked: "Period is locked. Cannot save vouchers for this date.",
  };
  const errorMsg = params.error ? ERROR_MESSAGES[params.error] ?? "" : "";

  return (
    <Shell active="fin-bp">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">{TITLE}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {totalCount} voucher{totalCount === 1 ? "" : "s"}
              {findFilter ? ` — matching "${findFilter}"` : ""} · FY {fyCode || "—"}
            </p>
          </div>
          <ExcelExportButton
            rows={vouchers.map((v) => ({
              vno: v.vno,
              vdate: v.vdate,
              vtime: v.vtime,
              bank: v.accCode ? descMap.get(v.accCode) ?? v.accCode : "",
              trnType: v.trnType,
              total: v.balanceAmount,
            }))}
            columns={[
              { key: "vno", label: "V.No" },
              { key: "vdate", label: "Date" },
              { key: "vtime", label: "Time" },
              { key: "bank", label: "Bank" },
              { key: "trnType", label: "Trn.Type" },
              { key: "total", label: "Total" },
            ]}
            filename="bank-payments"
            sheetName="BankPayments"
          />
        </div>

        {errorMsg && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {errorMsg}
            {params.error === "period_locked" && params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
          </div>
        )}

        <form id="vf-find-form" method="GET" action={BASE} className="hidden"></form>

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
                  <form action={markOk} className="inline">
                    <input type="hidden" name="id" value={formVoucher.id} />
                    <button type="submit" className="btn btn-outline btn-sm">
                      OK
                    </button>
                  </form>
                  <form action={clearOk} className="inline">
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
                <button type="submit" form="vf-save-form" className="btn btn-sm">
                  Save
                </button>
              )}
              <PrintButton label="Print" />
              {formVoucher && session?.roleName === "ADMIN" && (
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
            <form id="vf-save-form" action={saveVoucher}>
              {formVoucher && <input type="hidden" name="id" value={formVoucher.id} />}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Date</label>
                  <input
                    name="v_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={headVoucher?.vdate ?? today()}
                    required
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="label block mb-1">Time</label>
                  <input
                    name="v_time"
                    className="input-box mono bg-gray-100"
                    defaultValue={headVoucher?.vtime ?? nowTime()}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">V. No</label>
                  <input
                    className="input-box mono bg-gray-100 text-center"
                    defaultValue={formVoucher ? formVoucher.vno : upcomingVno}
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
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Trn.Type</label>
                  <select
                    name="trn_type"
                    className="input-box mono"
                    defaultValue={headVoucher?.trnType ?? ""}
                  >
                    <option value="">—</option>
                    {TRN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    {headVoucher?.trnType && !TRN_TYPES.includes(headVoucher.trnType) && (
                      <option value={headVoucher.trnType}>{headVoucher.trnType}</option>
                    )}
                  </select>
                </div>
                <div className="lg:col-span-3 flex items-end gap-2 pb-[2px]">
                  <label className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.05em]">
                    <input
                      type="checkbox"
                      name="splitting"
                      value="Y"
                      defaultChecked={headVoucher?.splitting === "Y"}
                      className="w-4 h-4 accent-black"
                    />
                    Spliting Amouuunt
                  </label>
                </div>

                <div className="lg:col-span-3">
                  <label className="label block mb-1">Acc.Code (Bank)</label>
                  <Combobox
                    name="bank_acc"
                    options={bankOpts}
                    defaultValue={headVoucher?.accCode ?? ""}
                    placeholder="Bank account"
                    descTargetId="bp-bank-title"
                  />
                </div>
                <div className="lg:col-span-4">
                  <label className="label block mb-1">Tittle</label>
                  <input
                    id="bp-bank-title"
                    className="input-box bg-gray-100"
                    defaultValue={bankTitle}
                    readOnly
                    tabIndex={-1}
                    placeholder="Bank account title"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Due Date</label>
                  <input
                    name="due_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={headVoucher?.dueDate ?? ""}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Exp.Date</label>
                  <input
                    name="exp_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={headVoucher?.expDate ?? ""}
                  />
                </div>

                <div className="lg:col-span-4">
                  <label className="label block mb-1">Img</label>
                  <input
                    name="img"
                    className="input-box mono"
                    defaultValue={headVoucher?.img ?? ""}
                  />
                </div>
                <div className="lg:col-span-8">
                  <label className="label block mb-1">Find</label>
                  <div className="flex gap-2">
                    <input
                      form="vf-find-form"
                      name="find"
                      className="input-box mono flex-1"
                      defaultValue={params.find ?? ""}
                      placeholder="V.No / Bank Acc.Code"
                    />
                    <button form="vf-find-form" type="submit" className="btn btn-outline btn-sm">
                      Find
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                  Line Items
                </div>
                <div className="overflow-x-auto border border-black">
                  <table className="mono text-[12px]" style={{ minWidth: 1440 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Sr#</th>
                        <th style={{ width: 150 }}>Short Name</th>
                        <th style={{ width: 220 }}>Tittle</th>
                        <th style={{ width: 34 }}>OK</th>
                        <th style={{ width: 150 }}>Yarn Count - (List - F9)</th>
                        <th style={{ width: 240 }}>Narr</th>
                        <th style={{ width: 120 }}>Chq.No</th>
                        <th style={{ width: 150 }}>Chq.Date</th>
                        <th style={{ width: 120 }} className="text-right">
                          {AMOUNT_LABEL}
                        </th>
                        <th style={{ width: 170 }}>Cost Center / Jobs (F9)</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: rowsToShow }).map((_, i) => {
                        const l = gridDetail[i];
                        const title = l?.accCode ? descMap.get(l.accCode) ?? "" : "";
                        const amt = l ? (IS_RECEIPT ? l.credit : l.debit) : null;
                        return (
                          <tr key={i}>
                            <td className="text-[var(--muted)] text-center">{i + 1}</td>
                            <td>
                              <input
                                name="line_acc"
                                list="fin-accts"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.accCode ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                className="input-box mono text-[12px] bg-gray-50"
                                defaultValue={title}
                                readOnly
                                tabIndex={-1}
                              />
                            </td>
                            <td className="text-center text-[10px] text-[var(--muted)]">
                              {l?.statusOk === "Y" ? "✓" : ""}
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
                                className="input-box text-[12px]"
                                defaultValue={l?.narration ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_chq_no"
                                list="bp-chq-endorse"
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
                                name="line_amt"
                                type="number"
                                step="any"
                                min="0"
                                className="input-box mono text-[12px] text-right"
                                defaultValue={amt ?? ""}
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
                <div className="ml-auto flex items-end gap-4">
                  <div>
                    <label className="label block mb-1">Balance Amount</label>
                    <VoucherBalance initial={headVoucher?.balanceAmount ?? 0} />
                  </div>
                </div>
              </div>

              <RowAutoFill watch="line_acc" map={lineTitleMap} />
              <RowAutoFill watch="line_chq_no" map={chqDateMap} />
              <datalist id="fin-accts">
                {pickerAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.descShort ? `${a.descShort} — ` : ""}
                    {a.description}
                  </option>
                ))}
              </datalist>
              <datalist id="bp-chq-endorse">
                {endorsable.map((c) => (
                  <option key={c.chqNo} value={c.chqNo as string}>
                    {c.chqDate ? `DT ${c.chqDate}` : ""}
                  </option>
                ))}
              </datalist>
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
                  <th>Time</th>
                  <th>Trn.Type</th>
                  <th>Bank</th>
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
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.vtime ?? "-"}
                        </a>
                      </td>
                      <td className="text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.trnType ?? "-"}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.accCode ? (
                            <>
                              <span className="mono">{v.accCode}</span>
                              <span className="text-[11px] text-[var(--muted)] ml-1">
                                — {descMap.get(v.accCode) ?? ""}
                              </span>
                            </>
                          ) : (
                            "-"
                          )}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(v.balanceAmount)}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {vouchers.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
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
