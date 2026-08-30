import { Shell } from "@/components/shell";
import { ImageAttach } from "@/components/image-attach";
import { ExcelExportButton } from "@/components/excel-export-button";
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

const VTYPE = "CR";
const BASE = "/finance/cr";
const TITLE = "CASH\u00A0\u00A0RECEIPTS (WVG)";
const LINE_ROWS = 4;
const TRN_TYPES = ["CASH", "CHEQUE", "ONLINE", "ADJUSTMENT"];

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

async function saveVoucher(formData: FormData) {
  "use server";
  try {
  const session = await getSession();
  const utCode = session?.userId ?? null;
  const idRaw = formData.get("id") as string | null;
  const idParsed = idRaw ? parseInt(idRaw, 10) : NaN;
  const editing = Number.isFinite(idParsed) && idParsed > 0;
  const id = editing ? idParsed : 0;
  const back = editing ? `&id=${id}` : "&adding=1";
  await assertPeriodOpen(txt(formData.get("v_date")) ?? today(), "FINANCE");

  const [company] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  if (!company || !company.currentFy) redirect(`${BASE}?error=no_fy`);
  const fyCode = company.currentFy;

  const accts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
    })
    .from(schema.chartOfAccounts)
    .where(gte(schema.chartOfAccounts.level, 4));
  const codeSet = new Set(accts.map((a) => a.code));
  const shortToCode = new Map<string, string>();
  const descToCode = new Map<string, string>();
  for (const a of accts) {
    if (a.descShort) {
      const k = a.descShort.trim().toUpperCase();
      if (k && !shortToCode.has(k)) shortToCode.set(k, a.code);
    }
    const dk = a.description.trim().toUpperCase();
    if (!descToCode.has(dk)) descToCode.set(dk, a.code);
  }
  const resolveAcc = (short: string, title: string): string | null => {
    const s = short.trim();
    const t = title.trim();
    if (s && codeSet.has(s)) return s;
    if (t && codeSet.has(t)) return t;
    if (s && shortToCode.has(s.toUpperCase())) return shortToCode.get(s.toUpperCase())!;
    if (t && descToCode.has(t.toUpperCase())) return descToCode.get(t.toUpperCase())!;
    if (s && descToCode.has(s.toUpperCase())) return descToCode.get(s.toUpperCase())!;
    return null;
  };

  const ccs = await db
    .select({ code: schema.costCenters.code, description: schema.costCenters.description })
    .from(schema.costCenters);
  const ccDescToCode = new Map<string, number>(
    ccs.map((c) => [c.description.trim().toUpperCase(), c.code])
  );
  const ccCodeSet = new Set(ccs.map((c) => String(c.code)));
  const resolveCc = (v: string | null): number | null => {
    if (!v) return null;
    const t = v.trim();
    if (!t) return null;
    if (ccCodeSet.has(t)) {
      const n = parseInt(t, 10);
      return Number.isFinite(n) ? n : null;
    }
    return ccDescToCode.get(t.toUpperCase()) ?? null;
  };

  const vdate = txt(formData.get("v_date")) ?? today();
  const img = txt(formData.get("img"));
  const dueDate = txt(formData.get("due_date"));
  const expDate = txt(formData.get("exp_date"));
  const trnType = txt(formData.get("trn_type"));
  const headNarr = txt(formData.get("narration"));
  const cashRaw = txt(formData.get("cash_acc")) ?? "";
  const cashCode = resolveAcc(cashRaw, cashRaw);

  const accs = formData.getAll("line_acc") as string[];
  const titles = formData.getAll("line_title") as string[];
  const yarns = formData.getAll("line_yarn") as string[];
  const narrs = formData.getAll("line_narr") as string[];
  const chqNos = formData.getAll("line_chq_no") as string[];
  const chqDates = formData.getAll("line_chq_date") as string[];
  const amounts = formData.getAll("line_amount") as string[];
  const ccIn = formData.getAll("line_cc") as string[];

  const rowCount = Math.max(accs.length, titles.length, amounts.length);
  type Row = {
    accCode: string;
    narr: string | null;
    chqNo: string | null;
    chqDate: string | null;
    ccCode: number | null;
    yarn: string | null;
    amount: number;
  };
  const rows: Row[] = [];
  let badAccount = false;
  for (let i = 0; i < rowCount; i++) {
    const acc = (accs[i] ?? "").trim();
    const title = (titles[i] ?? "").trim();
    const amount = num(amounts[i]);
    if (amount == null || amount <= 0) continue;
    const accCode = resolveAcc(acc, title);
    if (!accCode) {
      badAccount = true;
      continue;
    }
    rows.push({
      accCode,
      narr: (narrs[i] ?? "").trim() || null,
      chqNo: (chqNos[i] ?? "").trim() || null,
      chqDate: (chqDates[i] ?? "").trim() || null,
      ccCode: resolveCc(ccIn[i] ?? null),
      yarn: (yarns[i] ?? "").trim() || null,
      amount,
    });
  }

  if (badAccount) redirect(`${BASE}?error=bad_account${back}`);
  if (rows.length === 0) redirect(`${BASE}?error=no_lines${back}`);
  if (!cashCode) redirect(`${BASE}?error=no_cash${back}`);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) redirect(`${BASE}?error=bad_total${back}`);

  const buildDetails = (vno: number): (typeof schema.transDetail.$inferInsert)[] => {
    const details: (typeof schema.transDetail.$inferInsert)[] = [];
    rows.forEach((r, i) => {
      details.push({
        fyCode,
        vtype: VTYPE,
        vno,
        srno: i + 1,
        accCode: r.accCode,
        partyCode: cashCode,
        ccCode: r.ccCode,
        narration: r.narr,
        debit: 0,
        credit: r.amount,
        chqNo: r.chqNo,
        chqDate: r.chqDate,
        yarnCount: r.yarn,
      });
    });
    rows.forEach((r, i) => {
      const chq = r.chqNo ? ` CHQ.#: ${r.chqNo}${r.chqDate ? " DT." + r.chqDate : ""}` : "";
      details.push({
        fyCode,
        vtype: VTYPE,
        vno,
        srno: 50 + i,
        accCode: cashCode!,
        partyCode: cashCode,
        narration: ((r.narr ?? "") + chq).trim() || null,
        debit: r.amount,
        credit: 0,
      });
    });
    return details;
  };

  const assertBalanced = (details: (typeof schema.transDetail.$inferInsert)[]) => {
    const d = details.reduce((s, x) => s + (x.debit ?? 0), 0);
    const c = details.reduce((s, x) => s + (x.credit ?? 0), 0);
    if (Math.abs(d - c) >= 0.01) throw new Error("Unbalanced voucher");
  };

  if (editing) {
    const [main] = await db
      .select()
      .from(schema.transMain)
      .where(eq(schema.transMain.id, id))
      .limit(1);
    if (!main) redirect(BASE);
    await db.transaction(async (tx) => {
      await tx
        .update(schema.transMain)
        .set({
          vdate,
          vdateModified: today(),
          accCode: cashCode,
          narration: headNarr ?? rows[0]?.narr ?? null,
          dueDate,
          expDate,
          trnType,
          img,
          balanceAmount: total,
          vtime: main.vtime ?? nowTime(),
          utCode,
        })
        .where(eq(schema.transMain.id, id));
      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.fyCode, main.fyCode),
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, main.vno)
          )
        );
      const details = buildDetails(main.vno);
      assertBalanced(details);
      await tx.insert(schema.transDetail).values(details);
    });
    revalidatePath(BASE);
    redirect(`${BASE}?id=${id}`);
  } else {
    let newId = 0;
    let codeExists = false;
    try {
      newId = await db.transaction(async (tx) => {
        const [maxRow] = await tx
          .select({ max: sql<number>`coalesce(max(${schema.transMain.vno}), 0)` })
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
            accCode: cashCode,
            narration: headNarr ?? rows[0]?.narr ?? null,
            vtime: nowTime(),
            dueDate,
            expDate,
            trnType,
            img,
            balanceAmount: total,
            utCode,
          })
          .returning({ id: schema.transMain.id });
        const insertedId = inserted[0].id;
        const details = buildDetails(vno);
        assertBalanced(details);
        await tx.insert(schema.transDetail).values(details);
        return insertedId;
      });
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "";
      if (/UNIQUE|constraint/i.test(msg)) codeExists = true;
      else throw e;
    }
    if (codeExists) redirect(`${BASE}?error=code_exists&adding=1`);
    revalidatePath(BASE);
    redirect(`${BASE}?id=${newId}`);
  }
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
  const id = num(formData.get("id"));
  if (id === null) return;
  const [main] = await db
    .select()
    .from(schema.transMain)
    .where(eq(schema.transMain.id, id))
    .limit(1);
  if (!main) redirect(BASE);
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.transDetail)
      .where(
        and(
          eq(schema.transDetail.fyCode, main.fyCode),
          eq(schema.transDetail.vtype, main.vtype),
          eq(schema.transDetail.vno, main.vno)
        )
      );
    await tx.delete(schema.transMain).where(eq(schema.transMain.id, main.id));
  });
  revalidatePath(BASE);
  redirect(BASE);
}

async function setOkStatus(formData: FormData) {
  "use server";
  const id = num(formData.get("id"));
  if (id === null) return;
  const [main] = await db
    .select()
    .from(schema.transMain)
    .where(eq(schema.transMain.id, id))
    .limit(1);
  if (!main) redirect(BASE);
  await db
    .update(schema.transDetail)
    .set({ statusOk: formData.get("ok") ? "OK" : null })
    .where(
      and(
        eq(schema.transDetail.fyCode, main.fyCode),
        eq(schema.transDetail.vtype, VTYPE),
        eq(schema.transDetail.vno, main.vno)
      )
    );
  revalidatePath(BASE);
  redirect(`${BASE}?id=${id}`);
}

const ERR_MSG: Record<string, string> = {
  code_exists: "Voucher number already exists. Try again.",
  no_fy: "Company profile has no current fiscal year configured.",
  no_lines: "Add at least one line with a valid account and amount.",
  no_cash: "Set a valid Cash A/C (contra account) before saving.",
  bad_total: "Total must be greater than zero.",
  bad_account: "A line has an account name that does not match the Chart of Accounts.",
  admin_only: "Only ADMIN can delete vouchers.",
  period_locked: "Period is locked. Cannot save vouchers for this date.",
};

export default async function CashReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";
  const findFilter = params.find?.trim() ?? "";

  const [company] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.currentFy ?? "";

  const pat = findFilter ? `%${escapeLike(findFilter)}%` : "";
  const listWhere = and(
    eq(schema.transMain.vtype, VTYPE),
    fyCode ? eq(schema.transMain.fyCode, fyCode) : undefined,
    findFilter
      ? sql`(${schema.transMain.narration} LIKE ${pat} ESCAPE '\\' OR CAST(${schema.transMain.vno} AS TEXT) LIKE ${pat} ESCAPE '\\')`
      : undefined
  );
  const vouchers = await db
    .select()
    .from(schema.transMain)
    .where(listWhere)
    .orderBy(desc(schema.transMain.id))
    .limit(200);

  let selected = isEditing ? vouchers.find((v) => v.id === idParam) ?? null : null;
  if (isEditing && !selected) {
    const [row] = await db
      .select()
      .from(schema.transMain)
      .where(and(eq(schema.transMain.id, idParam), eq(schema.transMain.vtype, VTYPE)))
      .limit(1);
    selected = row ?? null;
  }
  const formVoucher = isAdding ? null : selected;

  const detailLines = formVoucher
    ? await db
        .select()
        .from(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.fyCode, formVoucher.fyCode),
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, formVoucher.vno)
          )
        )
        .orderBy(schema.transDetail.srno)
    : [];
  const gridLines = detailLines.filter((l) => l.srno < 50 && (l.credit ?? 0) > 0);

  const accounts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
    })
    .from(schema.chartOfAccounts)
    .where(gte(schema.chartOfAccounts.level, 4))
    .orderBy(schema.chartOfAccounts.code);
  const yarnList = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.countCode);
  const costCenters = await db
    .select({ code: schema.costCenters.code, description: schema.costCenters.description })
    .from(schema.costCenters)
    .orderBy(schema.costCenters.code);

  const codeToAcc = new Map(accounts.map((a) => [a.code, a]));
  const accOpts = accounts.map((a) => ({
    value: a.code,
    label: `${a.code} — ${a.description}`,
    desc: a.description,
  }));
  const accDescMap = Object.fromEntries(
    accounts.map((a) => [a.code, { line_title: a.description }])
  );
  const ccCodeToDesc = new Map(costCenters.map((c) => [c.code, c.description]));
  const defaultCash =
    accounts.find((a) => (a.descShort ?? "").trim().toUpperCase() === "CASH") ??
    accounts.find((a) => a.description.toUpperCase().includes("CASH")) ??
    null;

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${schema.transMain.vno}), 0)` })
    .from(schema.transMain)
    .where(and(eq(schema.transMain.fyCode, fyCode), eq(schema.transMain.vtype, VTYPE)));
  const upcomingVno = (maxRow?.max ?? 0) + 1;

  const totalsRows = await db
    .select({
      fy: schema.transDetail.fyCode,
      vno: schema.transDetail.vno,
      total: sql<number>`coalesce(sum(${schema.transDetail.debit}), 0)`,
    })
    .from(schema.transDetail)
    .where(eq(schema.transDetail.vtype, VTYPE))
    .groupBy(schema.transDetail.fyCode, schema.transDetail.vno);
  const totalMap = new Map(totalsRows.map((r) => [`${r.fy}|${r.vno}`, r.total]));

  const lastVno = maxRow?.max ?? 0;
  const rowsToShow = Math.max(LINE_ROWS, gridLines.length + 2);
  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const cashDefaultValue = formVoucher ? formVoucher.accCode ?? "" : defaultCash?.code ?? "";
  const cashTitleDefault = codeToAcc.get(cashDefaultValue)?.description ?? "";

  return (
    <Shell active="fin-cr">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">{TITLE}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              FY {fyCode} &middot; {vouchers.length} voucher{vouchers.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="mono text-[11px] text-[var(--muted)] flex gap-1 no-print">
              <span className="btn btn-outline btn-sm cursor-default">&laquo;</span>
              <span className="btn btn-outline btn-sm cursor-default">&lsaquo;</span>
              <span className="btn btn-outline btn-sm cursor-default">&rsaquo;</span>
              <span className="btn btn-outline btn-sm cursor-default">&raquo;</span>
            </div>
            <ExcelExportButton
              rows={vouchers.map((v) => ({
                vno: v.vno,
                vdate: v.vdate,
                narration: v.narration,
                trnType: v.trnType,
                total: totalMap.get(`${v.fyCode}|${v.vno}`) ?? 0,
              }))}
              columns={[
                { key: "vno", label: "V.No" },
                { key: "vdate", label: "Date" },
                { key: "narration", label: "Narration" },
                { key: "trnType", label: "Trn.Type" },
                { key: "total", label: "Amount" },
              ]}
              filename="cash-receipts"
              sheetName="CashReceipts"
            />
          </div>
        </div>

        {params.error && ERR_MSG[params.error] && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {ERR_MSG[params.error]}
            {params.error === "period_locked" && params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
          </div>
        )}

        <datalist id="fin-yarns">
          {yarnList.map((y) => (
            <option key={y.countCode} value={y.countCode}>
              {y.description ? `${y.countCode} — ${y.description}` : y.countCode}
            </option>
          ))}
        </datalist>
        <datalist id="cost-centers">
          {costCenters.map((c) => (
            <option key={c.code} value={c.description}>
              {c.code}
            </option>
          ))}
        </datalist>

        <form id="cr-find-form" method="GET" action={BASE} className="hidden"></form>

        <div className="border border-black p-4 mb-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? `New — ${TITLE}`
                : formVoucher
                ? `Edit — CR #${formVoucher.vno}`
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
              <button type="submit" form="cr-save-form" className="btn btn-sm">
                Save
              </button>
              {formVoucher?.id ? (
                <a
                  href={`/reports/gpv?v=${VTYPE}&n=${formVoucher.vno}${fyCode ? `&fy=${encodeURIComponent(fyCode)}` : ""}`}
                  className="btn btn-outline btn-sm"
                  target="_blank"
                  rel="noreferrer"
                >
                  Print
                </a>
              ) : null}
              {formVoucher && (
                <form action={deleteVoucher} className="inline">
                  <input type="hidden" name="id" value={formVoucher.id} />
                  <ConfirmButton message="Delete this voucher? This cannot be undone.">
                    Del
                  </ConfirmButton>
                </form>
              )}
              <a href={BASE} className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          <form id="cr-save-form" action={saveVoucher}>
            {formVoucher && <input type="hidden" name="id" value={formVoucher.id} />}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3 gform">
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
              <div className="lg:col-span-2">
                <label className="label block mb-1">Time</label>
                <input
                  className="input-box mono bg-gray-100"
                  defaultValue={formVoucher?.vtime?.slice(0, 5) ?? nowTime().slice(0, 5)}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">V. No</label>
                <input
                  className="input-box mono bg-gray-100 text-center"
                  value={formVoucher?.vno ?? upcomingVno}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">LV.No</label>
                <input
                  className="input-box mono bg-gray-100 text-center"
                  value={lastVno}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Trn.Type</label>
                <select name="trn_type" className="input-box mono" defaultValue={formVoucher?.trnType ?? "CASH"}>
                  {TRN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {formVoucher?.trnType && !TRN_TYPES.includes(formVoucher.trnType) && (
                    <option value={formVoucher.trnType}>{formVoucher.trnType}</option>
                  )}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Img</label>
                <ImageAttach name="img" defaultValue={formVoucher?.img ?? ""} />
              </div>

              <div className="lg:col-span-2">
                <label className="label block mb-1">Due Date</label>
                <input
                  name="due_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formVoucher?.dueDate ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Exp.Date</label>
                <input
                  name="exp_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formVoucher?.expDate ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Cash A/C (contra — debited)</label>
                <Combobox
                  name="cash_acc"
                  options={accOpts}
                  defaultValue={cashDefaultValue}
                  placeholder="F9 — Chart of Accounts"
                  descTargetId="cr-cash-title"
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Tittle</label>
                <input
                  id="cr-cash-title"
                  className="input-box mono bg-gray-100"
                  defaultValue={cashTitleDefault}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Narration (header)</label>
                <input
                  name="narration"
                  className="input-box mono"
                  defaultValue={formVoucher?.narration ?? ""}
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                Receipt Lines — each line is CREDITED; Cash A/C is debited per line
              </div>
              <RowAutoFill watch="line_acc" map={accDescMap} />
              <div className="overflow-x-auto border border-black">
                <table className="mono text-[12px]" style={{ minWidth: 1400 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>Sr#</th>
                      <th style={{ width: 200 }}>Account (F9)</th>
                      <th style={{ width: 240 }}>Tittle</th>
                      <th style={{ width: 34 }}>OK</th>
                      <th style={{ width: 110 }}>Yarn Count</th>
                      <th style={{ width: 220 }}>Narr</th>
                      <th style={{ width: 110 }}>Chq.No</th>
                      <th style={{ width: 130 }}>Chq.Date</th>
                      <th style={{ width: 120 }}>Cr</th>
                      <th style={{ width: 180 }}>Cost Center - F9</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowsToShow }).map((_, i) => {
                      const l = gridLines[i];
                      const acc = l ? codeToAcc.get(l.accCode) : undefined;
                      return (
                        <tr key={i}>
                          <td className="text-center text-[var(--muted)]">{i + 1}</td>
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
                              className="input-box mono text-[12px] bg-gray-50"
                              defaultValue={acc?.description ?? ""}
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
                              defaultValue={l?.credit ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="line_cc"
                              list="cost-centers"
                              className="input-box mono text-[12px]"
                              defaultValue={l && l.ccCode != null ? ccCodeToDesc.get(l.ccCode) ?? "" : ""}
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
                Empty rows (no amount) are ignored. Account must match a level 4+ account. On update all lines are replaced.
              </div>
            </div>

            <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
              <a href={`${BASE}?adding=1`} className="btn btn-outline btn-sm">
                New
              </a>
              <button type="submit" className="btn btn-sm">
                Save
              </button>
              {formVoucher?.id ? (
                <a
                  href={`/reports/gpv?v=${VTYPE}&n=${formVoucher.vno}${fyCode ? `&fy=${encodeURIComponent(fyCode)}` : ""}`}
                  className="btn btn-outline btn-sm"
                  target="_blank"
                  rel="noreferrer"
                >
                  Print
                </a>
              ) : null}
              <a href={BASE} className="btn btn-outline btn-sm">
                Exit
              </a>
              <div className="ml-auto flex items-end gap-3">
                <div className="w-44">
                  <label className="label block mb-1 text-right">Balance Amount</label>
                  <VoucherBalance
                    initial={formVoucher?.balanceAmount ?? 0}
                    fieldName="line_amount"
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-[0.1em] font-semibold">Vouchers</span>
            <div className="flex gap-2 no-print">
              <input
                form="cr-find-form"
                name="find"
                className="input-box mono"
                defaultValue={params.find ?? ""}
                placeholder="V.No / Narration"
              />
              <button form="cr-find-form" type="submit" className="btn btn-outline btn-sm">
                Find
              </button>
              {findFilter && (
                <a href={BASE} className="btn btn-outline btn-sm">
                  Clear
                </a>
              )}
            </div>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>Date</th>
                  <th>Trn.Type</th>
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
                      className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
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
                          {v.trnType ?? "-"}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.narration ?? "-"}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(totalMap.get(`${v.fyCode}|${v.vno}`) ?? 0)}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {vouchers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-[13px] text-[var(--muted)] py-6">
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
