import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { ConfirmButton } from "@/components/confirm-button";
import { RowClearButton } from "@/components/row-clear-button";
import { RowAutoFill } from "@/components/auto-fill";
import { db, schema } from "@/db";
import { and, eq, sql, desc, gte, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { today, nowTime } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num, intVal, txt, fmtMoney as formatNum } from "@/lib/form";
import { DateBox } from "@/components/date-box";

export const dynamic = "force-dynamic";

const VTYPE = "ADV";
const BASE = "/finance/advance-cheque";
const TITLE = "ADVANCE CHEQUE (WVG)";
const LINE_ROWS = 6;

// Per-bank advance-cheque accounts (Dr on clear/bounce, Cr on issue).
const ADV_PREFIX = "1.01.15.03.";
// Actual bank accounts (Cr on clear).
const BANK_PREFIX = "1.01.15.02.";
// Per-party "CHQ FAILLED …" dishonour accounts (Cr on bounce).
const DISHONOUR_PREFIX = "1.01.15.04.";

async function currentFy(): Promise<string> {
  const [company] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  return company?.currentFy ?? "";
}

async function validAccounts(codes: string[]): Promise<boolean> {
  const uniq = Array.from(new Set(codes));
  const rows = await db
    .select({ code: schema.chartOfAccounts.code })
    .from(schema.chartOfAccounts)
    .where(and(inArray(schema.chartOfAccounts.code, uniq), gte(schema.chartOfAccounts.level, 4)));
  return rows.length === uniq.length;
}

/** Next vno for ADV within a fiscal year (inside a tx). */
async function nextVno(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  fyCode: string,
): Promise<number> {
  const [maxRow] = await tx
    .select({ max: sql<number>`coalesce(max(vno), 0)` })
    .from(schema.transMain)
    .where(and(eq(schema.transMain.fyCode, fyCode), eq(schema.transMain.vtype, VTYPE)));
  return (maxRow?.max ?? 0) + 1;
}

function periodRedirect(e: unknown): never {
  const err = e as { message?: string; digest?: string };
  if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
  const thru = parseLockedThroughFromError(err.message ?? "");
  if (thru) redirect(`${BASE}?error=period_locked&thru=${thru}`);
  throw e;
}

// ── Issue (batch): each grid line = one cheque = Dr Party / Cr Bank-Advance ───
async function issueCheques(formData: FormData) {
  "use server";
  try {
    const session = await getSession();
    const utCode = session?.userId ?? null;
    const vdate = txt(formData.get("v_date")) ?? today();

    // One party per voucher. Three cheques of 3 lac plus 3 lac cash is ONE
    // payment of 12 lac to one party, so it posts as one voucher: the party is
    // debited the whole 12 lac on a single line and the ledger shows it as one
    // recovery, split across each bank-advance account and cash.
    const editId = intVal(formData.get("edit_id"));
    const isEdit = editId !== null && editId > 0;
    const party = (txt(formData.get("party")) ?? "").trim();
    const cash = num(formData.get("cash_amt")) ?? 0;
    const backTo = isEdit ? `&action=edit&id=${editId}` : "&adding=1";
    if (!party) redirect(`${BASE}?error=invalid${backTo}`);

    const advs = formData.getAll("line_adv") as string[];
    const chqNos = formData.getAll("line_chq_no") as string[];
    const chqDates = formData.getAll("line_chq_date") as string[];
    const amounts = formData.getAll("line_amt") as string[];
    const narrs = formData.getAll("line_narr") as string[];

    const rowCount = Math.max(advs.length, chqNos.length, amounts.length);
    const lines: { adv: string; chqNo: string; chqDate: string | null; amount: number; narration: string | null }[] = [];
    for (let i = 0; i < rowCount; i++) {
      const adv = (advs[i] ?? "").trim();
      const chqNo = (chqNos[i] ?? "").trim();
      const amount = num(amounts[i]);
      // Fully-empty row → skip.
      if (!adv && !chqNo && amount === null) continue;
      if (!adv || !chqNo || amount === null || amount <= 0) {
        redirect(`${BASE}?error=invalid${backTo}`);
      }
      lines.push({
        adv,
        chqNo,
        chqDate: (chqDates[i] ?? "").trim() || null,
        amount: amount!,
        narration: (narrs[i] ?? "").trim() || null,
      });
    }
    // Cash on its own is a cash payment, not an advance cheque — at least one
    // cheque has to be here.
    if (!lines.length) redirect(`${BASE}?error=invalid${backTo}`);

    // A row may also hand over CASH with the cheque — the same voucher then debits
    // the party for cheque + cash and credits cash-in-hand separately, so both
    // show in one place. Resolve the cash account only when actually needed.
    let cashAcc: string | null = null;
    if (cash > 0) {
      const accs = await db
        .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description, descShort: schema.chartOfAccounts.descShort })
        .from(schema.chartOfAccounts)
        .where(sql`${schema.chartOfAccounts.level} >= 4`);
      cashAcc =
        (accs.find((a) => (a.descShort ?? "").trim().toUpperCase() === "CASH") ??
          accs.find((a) => (a.description ?? "").toUpperCase().includes("CASH IN HAND")) ??
          accs.find((a) => (a.description ?? "").toUpperCase().includes("CASH")))?.code ?? null;
      if (!cashAcc) redirect(`${BASE}?error=no_cash${backTo}`);
    }

    await assertPeriodOpen(vdate, "FINANCE");

    // Editing re-posts into the SAME voucher number, so the ledger keeps one
    // entry rather than sprouting a second one beside the first. Refused once
    // any cheque on it has cleared or bounced — the money has moved by then and
    // that transition has to be undone first.
    let editVno = 0;
    let editFy = "";
    if (isEdit) {
      const [m] = await db
        .select()
        .from(schema.transMain)
        .where(and(eq(schema.transMain.id, editId!), eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.trnType, "ISSUE")));
      if (!m) redirect(`${BASE}?error=not_found`);
      editVno = m!.vno;
      editFy = m!.fyCode;
      const existingChqs = (
        await db
          .select({ chqNo: schema.transDetail.chqNo })
          .from(schema.transDetail)
          .where(and(eq(schema.transDetail.fyCode, editFy), eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.vno, editVno)))
      )
        .map((r) => (r.chqNo ?? "").trim())
        .filter(Boolean);
      for (const c of Array.from(new Set(existingChqs))) {
        const t = await chequeTallies(c);
        if (t.clears + t.bounces > 0) redirect(`${BASE}?error=settled_no_edit&id=${editId}`);
      }
    }

    // Duplicate cheque numbers within the batch.
    const seen = new Set<string>();
    for (const l of lines) {
      if (seen.has(l.chqNo)) redirect(`${BASE}?error=dup_chq${backTo}`);
      seen.add(l.chqNo);
    }

    if (!(await validAccounts([party, ...lines.map((l) => l.adv)]))) {
      redirect(`${BASE}?error=bad_account${backTo}`);
    }

    // Cheque numbers already used on an existing ADV issue. A number whose every
    // prior issue BOUNCED (cheque physically came back) may be issued again —
    // compare distinct ISSUE vouchers against distinct BOUNCE vouchers per chqNo.
    const lifecycleRows = await db
      .select({
        chqNo: schema.transDetail.chqNo,
        trnType: schema.transMain.trnType,
        vno: schema.transMain.vno,
      })
      .from(schema.transMain)
      .innerJoin(
        schema.transDetail,
        and(
          eq(schema.transDetail.fyCode, schema.transMain.fyCode),
          eq(schema.transDetail.vtype, schema.transMain.vtype),
          eq(schema.transDetail.vno, schema.transMain.vno),
        ),
      )
      .where(and(
        eq(schema.transMain.vtype, VTYPE),
        inArray(schema.transMain.trnType, ["ISSUE", "BOUNCE"]),
        inArray(schema.transDetail.chqNo, Array.from(seen)),
      ));
    const issueVnos = new Map<string, Set<number>>();
    const bounceVnos = new Map<string, Set<number>>();
    for (const r of lifecycleRows) {
      const chq = (r.chqNo ?? "").trim();
      if (!chq) continue;
      if (isEdit && r.vno === editVno) continue; // its own numbers are not a clash
      const m = r.trnType === "ISSUE" ? issueVnos : bounceVnos;
      (m.get(chq) ?? m.set(chq, new Set()).get(chq)!).add(r.vno);
    }
    const activeClash = Array.from(seen).some(
      (chq) => (issueVnos.get(chq)?.size ?? 0) > (bounceVnos.get(chq)?.size ?? 0),
    );
    if (activeClash) redirect(`${BASE}?error=dup_chq${backTo}`);

    const fyCode = await currentFy();
    if (!fyCode && !isEdit) redirect(`${BASE}?error=no_fy${backTo}`);
    const vtime = nowTime();

    const chqTotal = lines.reduce((s2, l) => s2 + l.amount, 0);
    const total = chqTotal + cash;
    const narr =
      `ADVANCE CHQ ISSUE ${lines.length > 1 ? `${lines.length} CHQ ` : ""}` +
      `#${lines.map((l) => l.chqNo).join(", #")}` +
      `${cash > 0 ? ` + CASH ${cash}` : ""}` +
      `${lines.map((l) => l.narration).filter(Boolean).join("; ") ? ` — ${lines.map((l) => l.narration).filter(Boolean).join("; ")}` : ""}`;

    await db.transaction(async (tx) => {
      // Re-posting an edit: clear the old rows first, then write the voucher
      // again at the same number. Same delete-before-post rule the rest of the
      // system follows, so a correction can never leave half an entry behind.
      if (isEdit) {
        await tx.delete(schema.transDetail).where(
          and(eq(schema.transDetail.fyCode, editFy), eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.vno, editVno)),
        );
        await tx.delete(schema.transMain).where(
          and(eq(schema.transMain.fyCode, editFy), eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.vno, editVno)),
        );
      }
      const vno = isEdit ? editVno : await nextVno(tx, fyCode);
      await tx.insert(schema.transMain).values({
        fyCode: isEdit ? editFy : fyCode,
        vtype: VTYPE, vno, vdate, vtime,
        accCode: party, trnType: "ISSUE", narration: narr, balanceAmount: total, utCode,
      });
      const fy = isEdit ? editFy : fyCode;
      const dets: (typeof schema.transDetail.$inferInsert)[] = [
        // The party owes the WHOLE payment on one line — that is the recovery.
        // It carries no cheque number because it is not one cheque; each cheque
        // is a credit leg below, and the lifecycle keys off those.
        { fyCode: fy, vtype: VTYPE, vno, srno: 1, accCode: party, partyCode: lines[0].adv, narration: narr, debit: total, credit: 0 },
      ];
      let srno = 2;
      for (const l of lines) {
        dets.push({
          fyCode: fy, vtype: VTYPE, vno, srno: srno++, accCode: l.adv, partyCode: party,
          narration: `${narr}`, debit: 0, credit: l.amount, chqNo: l.chqNo, chqDate: l.chqDate,
        });
      }
      if (cash > 0 && cashAcc) {
        dets.push({ fyCode: fy, vtype: VTYPE, vno, srno: srno++, accCode: cashAcc, partyCode: party, narration: narr, debit: 0, credit: cash });
      }
      await tx.insert(schema.transDetail).values(dets);
    });
    revalidatePath(BASE);
    redirect(BASE);
  } catch (e) {
    periodRedirect(e);
  }
}

/** Load ONE cheque of an ISSUE voucher, for a clear/bounce/re-issue. */
async function loadIssue(id: number, wantChqNo?: string) {
  const [main] = await db
    .select()
    .from(schema.transMain)
    .where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.trnType, "ISSUE")));
  if (!main) return null;
  const lines = await db
    .select()
    .from(schema.transDetail)
    .where(and(eq(schema.transDetail.fyCode, main.fyCode), eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.vno, main.vno)))
    .orderBy(schema.transDetail.srno);
  const drLine = lines.find((l) => (l.debit ?? 0) > 0);
  // A voucher can now hold several cheques (and a cash leg with no cheque number
  // at all), so a transition has to say WHICH cheque it is about. Without a
  // chqNo we take the first one, which is what a single-cheque voucher means.
  const chqLegs = lines.filter((l) => (l.credit ?? 0) > 0 && (l.chqNo ?? "").trim());
  const crLine = wantChqNo
    ? chqLegs.find((l) => (l.chqNo ?? "").trim() === wantChqNo.trim())
    : chqLegs[0];
  if (!drLine || !crLine) return null;
  return {
    main,
    party: drLine.accCode,
    bankAdv: crLine.accCode,
    chqNo: (crLine.chqNo ?? "").trim(),
    chqDate: crLine.chqDate ?? "",
    // Cheque amount only — clear/bounce reverse that one advance leg, never the
    // cash and never the other cheques on the same voucher.
    amount: crLine.credit ?? 0,
  };
}

/**
 * Lifecycle tallies per cheque number: distinct ISSUE / CLEAR / BOUNCE vouchers.
 * A cheque can be re-issued after a bounce, so "already cleared/bounced" means
 * every issue is settled (clears + bounces >= issues), not "a transition exists".
 */
async function chequeTallies(chqNo: string): Promise<{ issues: number; clears: number; bounces: number }> {
  const zero = { issues: 0, clears: 0, bounces: 0 };
  if (!chqNo) return zero;
  const rows = await db
    .select({ vno: schema.transMain.vno, trnType: schema.transMain.trnType })
    .from(schema.transMain)
    .innerJoin(
      schema.transDetail,
      and(
        eq(schema.transDetail.fyCode, schema.transMain.fyCode),
        eq(schema.transDetail.vtype, schema.transMain.vtype),
        eq(schema.transDetail.vno, schema.transMain.vno),
      ),
    )
    .where(and(eq(schema.transMain.vtype, VTYPE), eq(schema.transDetail.chqNo, chqNo)));
  const seen: Record<string, Set<number>> = { ISSUE: new Set(), CLEAR: new Set(), BOUNCE: new Set() };
  for (const r of rows) seen[r.trnType ?? ""]?.add(r.vno);
  return { issues: seen.ISSUE.size, clears: seen.CLEAR.size, bounces: seen.BOUNCE.size };
}

// ── Clear: Dr Bank-Advance / Cr Bank ─────────────────────────────────────────
async function clearCheque(formData: FormData) {
  "use server";
  try {
    const session = await getSession();
    const utCode = session?.userId ?? null;
    const id = intVal(formData.get("id"));
    const bankAcc = txt(formData.get("bank_acc"));
    const clearDate = txt(formData.get("clear_date")) ?? today();
    if (id === null || !bankAcc) redirect(`${BASE}?error=invalid`);

    const issue = await loadIssue(id!, txt(formData.get("chq")) ?? undefined);
    if (!issue) redirect(`${BASE}?error=not_found`);
    await assertPeriodOpen(clearDate, "FINANCE");
    {
      const t = await chequeTallies(issue!.chqNo);
      if (t.clears + t.bounces >= t.issues)
        redirect(`${BASE}?error=${t.clears > 0 ? "already_cleared" : "already_bounced"}&id=${id}`);
    }
    if (!(await validAccounts([issue!.bankAdv, bankAcc!]))) redirect(`${BASE}?error=bad_account&id=${id}`);

    const { fyCode } = issue!.main;
    const amount = issue!.amount;
    const narr = `ADVANCE CHQ CLEARED #${issue!.chqNo}${issue!.chqDate ? ` DT ${issue!.chqDate}` : ""}`;
    await db.transaction(async (tx) => {
      const vno = await nextVno(tx, fyCode);
      await tx.insert(schema.transMain).values({
        fyCode, vtype: VTYPE, vno, vdate: clearDate, vtime: nowTime(),
        accCode: issue!.bankAdv, trnType: "CLEAR", narration: narr, balanceAmount: amount, utCode,
      });
      await tx.insert(schema.transDetail).values([
        { fyCode, vtype: VTYPE, vno, srno: 1, accCode: issue!.bankAdv, partyCode: bankAcc, narration: narr, debit: amount, credit: 0, chqNo: issue!.chqNo, chqDate: issue!.chqDate },
        { fyCode, vtype: VTYPE, vno, srno: 2, accCode: bankAcc!, partyCode: issue!.bankAdv, narration: narr, debit: 0, credit: amount, chqNo: issue!.chqNo, chqDate: issue!.chqDate },
      ]);
    });
    revalidatePath(BASE);
    redirect(`${BASE}?id=${id}`);
  } catch (e) {
    periodRedirect(e);
  }
}

// ── Bounce: Dr Bank-Advance / Cr party CHQ-FAILLED (dishonour) ────────────────
async function bounceCheque(formData: FormData) {
  "use server";
  try {
    const session = await getSession();
    const utCode = session?.userId ?? null;
    const id = intVal(formData.get("id"));
    const dishonour = txt(formData.get("dishonour_acc"));
    const bounceDate = txt(formData.get("bounce_date")) ?? today();
    const reason = txt(formData.get("reason"));
    if (id === null || !dishonour) redirect(`${BASE}?error=invalid`);

    const issue = await loadIssue(id!, txt(formData.get("chq")) ?? undefined);
    if (!issue) redirect(`${BASE}?error=not_found`);
    await assertPeriodOpen(bounceDate, "FINANCE");
    {
      const t = await chequeTallies(issue!.chqNo);
      if (t.clears + t.bounces >= t.issues)
        redirect(`${BASE}?error=${t.clears > 0 ? "already_cleared" : "already_bounced"}&id=${id}`);
    }
    if (!(await validAccounts([issue!.bankAdv, dishonour!]))) redirect(`${BASE}?error=bad_account&id=${id}`);

    const { fyCode } = issue!.main;
    const amount = issue!.amount;
    const narr = `ADVANCE CHQ BOUNCED #${issue!.chqNo}${reason ? ` — ${reason}` : ""}`;
    await db.transaction(async (tx) => {
      const vno = await nextVno(tx, fyCode);
      await tx.insert(schema.transMain).values({
        fyCode, vtype: VTYPE, vno, vdate: bounceDate, vtime: nowTime(),
        accCode: issue!.bankAdv, trnType: "BOUNCE", narration: narr, balanceAmount: amount, utCode,
      });
      await tx.insert(schema.transDetail).values([
        { fyCode, vtype: VTYPE, vno, srno: 1, accCode: issue!.bankAdv, partyCode: dishonour, narration: narr, debit: amount, credit: 0, chqNo: issue!.chqNo, chqDate: issue!.chqDate },
        { fyCode, vtype: VTYPE, vno, srno: 2, accCode: dishonour!, partyCode: issue!.party, narration: narr, debit: 0, credit: amount, chqNo: issue!.chqNo, chqDate: issue!.chqDate },
      ]);
    });
    revalidatePath(BASE);
    redirect(`${BASE}?id=${id}`);
  } catch (e) {
    periodRedirect(e);
  }
}

// ── Delete (ADMIN): removes the issue + its clear/bounce ──────────────────────
async function deleteCheque(formData: FormData) {
  "use server";
  const id = intVal(formData.get("id"));
  if (id === null) return;
  const session = await getSession();
  if (session?.roleName !== "ADMIN") redirect(`${BASE}?error=forbidden&id=${id}`);
  const issue = await loadIssue(id);
  if (!issue) redirect(BASE);
  const { fyCode, vno: issueVno } = issue.main;

  // A voucher can hold several cheques, so deleting it must take every
  // clear/bounce raised against ANY of them — otherwise a reversal would be
  // left behind pointing at an issue that no longer exists.
  const ownChqs = (
    await db
      .select({ chqNo: schema.transDetail.chqNo })
      .from(schema.transDetail)
      .where(and(eq(schema.transDetail.fyCode, fyCode), eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.vno, issueVno)))
  )
    .map((r) => (r.chqNo ?? "").trim())
    .filter(Boolean);
  const related = ownChqs.length
    ? await db
        .select({ vno: schema.transMain.vno })
        .from(schema.transMain)
        .innerJoin(
          schema.transDetail,
          and(
            eq(schema.transDetail.fyCode, schema.transMain.fyCode),
            eq(schema.transDetail.vtype, schema.transMain.vtype),
            eq(schema.transDetail.vno, schema.transMain.vno),
          ),
        )
        .where(and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.fyCode, fyCode), inArray(schema.transDetail.chqNo, Array.from(new Set(ownChqs)))))
    : [];
  const vnos = Array.from(new Set([issueVno, ...related.map((r) => r.vno)]));
  if (!vnos.length) redirect(BASE);
  await db.transaction(async (tx) => {
    await tx.delete(schema.transDetail).where(and(eq(schema.transDetail.fyCode, fyCode), eq(schema.transDetail.vtype, VTYPE), inArray(schema.transDetail.vno, vnos)));
    await tx.delete(schema.transMain).where(and(eq(schema.transMain.fyCode, fyCode), eq(schema.transMain.vtype, VTYPE), inArray(schema.transMain.vno, vnos)));
  });
  revalidatePath(BASE);
  redirect(BASE);
}

type Chq = {
  issueId: number;
  vno: number;
  vdate: string;
  chqNo: string;
  chqDate: string;
  party: string;
  bankAdv: string;
  amount: number;
  cash: number;
  /** How many cheques share this voucher — >1 means the payment was split. */
  chqCount?: number;
  status: "ISSUED" | "CLEARED" | "BOUNCED";
  clearBank?: string;
  clearDate?: string;
  dishonour?: string;
  bounceDate?: string;
};

export default async function AdvanceChequePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; action?: string; error?: string; find?: string; thru?: string; chq?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const fyCode = await currentFy();

  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const hasId = Number.isFinite(idParam) && idParam > 0;
  const action = params.action?.trim() ?? "";
  const isAdding = params.adding === "1";
  const isReissue = action === "reissue" && hasId;
  const isClearForm = action === "clear" && hasId;
  const isBounceForm = action === "bounce" && hasId;
  const isEditForm = action === "edit" && hasId;
  const chqParam = params.chq?.trim() ?? "";
  const findFilter = params.find?.trim() ?? "";

  const accounts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.code);
  const descMap = new Map(accounts.map((a) => [a.code, a.description ?? ""]));
  const opt = (a: { code: string; description: string | null }) => ({
    value: a.code,
    label: `${a.code} — ${a.description ?? ""}`,
    desc: a.description ?? "",
  });
  const partyOpts = accounts.filter((a) => a.level >= 4).map(opt);
  const advOpts = accounts.filter((a) => a.code.startsWith(ADV_PREFIX)).map(opt);
  const bankOpts = accounts.filter((a) => a.code.startsWith(BANK_PREFIX)).map(opt);
  const dishonourOpts = accounts.filter((a) => a.code.startsWith(DISHONOUR_PREFIX)).map(opt);
  const advTitleMap = Object.fromEntries(advOpts.map((o) => [o.value, { line_adv_title: o.desc }]));

  // Load ADV vouchers + detail for the register.
  const mains = fyCode
    ? await db
        .select()
        .from(schema.transMain)
        .where(and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.fyCode, fyCode)))
        .orderBy(desc(schema.transMain.vno))
    : [];
  const details = fyCode
    ? await db
        .select()
        .from(schema.transDetail)
        .where(and(eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.fyCode, fyCode)))
    : [];
  const byVno = new Map<number, typeof details>();
  for (const d of details) (byVno.get(d.vno) ?? byVno.set(d.vno, []).get(d.vno)!).push(d);

  const info = (vno: number) => {
    const ls = byVno.get(vno) ?? [];
    const dr = ls.find((l) => (l.debit ?? 0) > 0);
    // Advance legs = credits WITH a chqNo. Cash comes over as a credit with no
    // cheque number, so it is summed apart and reported beside the cheques.
    const chqLegs = ls.filter((l) => (l.credit ?? 0) > 0 && (l.chqNo ?? "").trim());
    const cr = chqLegs[0] ?? ls.find((l) => (l.credit ?? 0) > 0);
    const cash = ls.filter((l) => (l.credit ?? 0) > 0 && !(l.chqNo ?? "").trim()).reduce((s, l) => s + (l.credit ?? 0), 0);
    return {
      dr,
      cr,
      chqLegs,
      chqNo: (cr?.chqNo ?? dr?.chqNo ?? "").trim(),
      amount: cr?.credit ?? dr?.debit ?? 0,
      cash,
    };
  };

  const clearByChq = new Map<string, ReturnType<typeof info> & { vdate: string }>();
  const bounceVnosByChq = new Map<string, (ReturnType<typeof info> & { vdate: string; vno: number })[]>();
  for (const m of mains) {
    if (m.trnType === "CLEAR") clearByChq.set(info(m.vno).chqNo, { ...info(m.vno), vdate: m.vdate });
    if (m.trnType === "BOUNCE") {
      const it = { ...info(m.vno), vdate: m.vdate, vno: m.vno };
      (bounceVnosByChq.get(it.chqNo) ?? bounceVnosByChq.set(it.chqNo, []).get(it.chqNo)!).push(it);
    }
  }
  for (const arr of bounceVnosByChq.values()) arr.sort((a, b) => a.vno - b.vno);

  // A bounced cheque can be RE-ISSUED under the same number: pair each issue
  // (vno order) with a bounce; issues past the bounce count are active again.
  const issueOrdinal = new Map<string, number>();
  const cheques: Chq[] = mains
    .filter((m) => m.trnType === "ISSUE")
    .sort((a, b) => a.vno - b.vno)
    // One row per CHEQUE, not per voucher: a 12-lac payment made of three
    // cheques plus cash is one voucher but three cheques to chase, each with its
    // own clear/bounce. The voucher's cash rides on its first row so the Cash
    // and Total columns still add up down the page.
    .flatMap((m) => {
      const it = info(m.vno);
      const legs = it.chqLegs.length ? it.chqLegs : it.cr ? [it.cr] : [];
      return legs.map((leg, li) => {
        const chqNo = (leg.chqNo ?? "").trim();
        const ord = issueOrdinal.get(chqNo) ?? 0;
        issueOrdinal.set(chqNo, ord + 1);
        const bounces = bounceVnosByChq.get(chqNo) ?? [];
        const bo = ord < bounces.length ? bounces[ord] : undefined;
        const cl = !bo ? clearByChq.get(chqNo) : undefined;
        const status: Chq["status"] = bo ? "BOUNCED" : cl ? "CLEARED" : "ISSUED";
        return {
          issueId: m.id,
          vno: m.vno,
          vdate: m.vdate,
          chqNo,
          chqDate: leg.chqDate ?? "",
          party: it.dr?.accCode ?? "",
          bankAdv: leg.accCode ?? "",
          amount: leg.credit ?? 0,
          cash: li === 0 ? it.cash : 0,
          chqCount: legs.length,
          status,
          clearBank: cl?.cr?.accCode,
          clearDate: cl?.vdate,
          dishonour: bo?.cr?.accCode,
          bounceDate: bo?.vdate,
        };
      });
    })
    .sort((a, b) => b.vno - a.vno || a.chqNo.localeCompare(b.chqNo));

  const filtered = findFilter
    ? cheques.filter(
        (c) =>
          c.chqNo.toLowerCase().includes(findFilter.toLowerCase()) ||
          c.party.toLowerCase().includes(findFilter.toLowerCase()) ||
          (descMap.get(c.party) ?? "").toLowerCase().includes(findFilter.toLowerCase()),
      )
    : cheques;

  const stats = {
    issued: cheques.filter((c) => c.status === "ISSUED"),
    cleared: cheques.filter((c) => c.status === "CLEARED"),
    bounced: cheques.filter((c) => c.status === "BOUNCED"),
  };
  const outstanding = stats.issued.reduce((s, c) => s + c.amount, 0);

  // Prefill target for clear/bounce/reissue forms.
  const target = hasId
    ? cheques.find((c) => c.issueId === idParam && (!chqParam || c.chqNo === chqParam)) ??
      cheques.find((c) => c.issueId === idParam) ??
      null
    : null;
  // Every cheque on the voucher being edited, so the grid can be refilled.
  const editRows = isEditForm ? cheques.filter((c) => c.issueId === idParam) : [];
  const editCash = editRows.reduce((a, c) => a + c.cash, 0);

  const ERR: Record<string, string> = {
    invalid: "Pick the party, then give every line a bank-advance account, cheque no. and a positive amount. At least one cheque is required.",
    bad_account: "One or more account codes are unknown or not a detail (level 4+) account.",
    dup_chq: "This cheque number has an active issue. A number can only be re-used after its cheque bounced back.",
    no_cash: "No CASH account found in the chart of accounts (descShort CASH / description containing CASH).",
    no_fy: "Company fiscal year is not configured.",
    not_found: "Cheque not found.",
    already_cleared: "This cheque is already cleared.",
    already_bounced: "This cheque is already bounced.",
    settled_no_edit:
      "A cheque on this voucher has already cleared or bounced. Undo that first — the money has moved, so the issue cannot be rewritten underneath it.",
    forbidden: "Only ADMIN can delete.",
    period_locked: "Period is locked. Cannot post for this date.",
  };
  const errorMsg = params.error ? ERR[params.error] ?? "" : "";

  const statusPill = (s: Chq["status"]) => (
    <span
      className="inline-block text-[11px] px-2 py-0.5 uppercase font-semibold"
      style={{
        letterSpacing: "0.05em",
        border: "1px solid black",
        background: s === "CLEARED" ? "black" : s === "BOUNCED" ? "var(--danger)" : "transparent",
        color: s === "CLEARED" || s === "BOUNCED" ? "white" : "black",
      }}
    >
      {s}
    </span>
  );

  const showIssueForm = isAdding || isReissue || isEditForm;

  return (
    <Shell active="fin-advance-cheque">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">{TITLE}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {cheques.length} cheque{cheques.length === 1 ? "" : "s"} · FY {fyCode || "—"} · Dr party → Cr bank-advance, clear/bounce reverses it
            </p>
          </div>
          <div className="no-print flex gap-2">
            <a href={`${BASE}?adding=1`} className="btn btn-sm">New Advance Cheque</a>
            <a href="/reports/cheque-status" className="btn btn-outline btn-sm">Cheque Status</a>
          </div>
        </div>

        {errorMsg && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {errorMsg}
            {params.error === "period_locked" && params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-5">
            <div className="stat-value">{stats.issued.length}</div>
            <div className="stat-label">Issued (pending)</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{stats.cleared.length}</div>
            <div className="stat-label">Cleared</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{stats.bounced.length}</div>
            <div className="stat-label">Bounced</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value mono">{formatNum(outstanding)}</div>
            <div className="stat-label">Outstanding Amount</div>
          </div>
        </div>

        {/* Issue / Re-issue form — multi-line: many parties / accounts / cheques at once */}
        {showIssueForm && (
          <div className="border border-black p-4 mb-6">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
              {isEditForm
                ? `Edit Advance Cheque — voucher ${target?.vno ?? ""} (re-posts in place, same voucher no.)`
                : isReissue
                ? "Re-issue Advance Cheque — prefilled from the bounced cheque, same cheque no. Change the no if the bank gave a new leaf."
                : "New Advance Cheque — Issue (one party, any number of cheques + cash)"}
            </div>
            <form action={issueCheques}>
              {isEditForm && <input type="hidden" name="edit_id" value={idParam} />}
              {/* One party for the whole voucher. Three cheques plus cash to the
                  same party is ONE payment, so the party belongs up here with the
                  date, not repeated down every row. */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3 gform mb-4">
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Date</label>
                  <DateBox
                    name="v_date"
                    className="input-box mono"
                    defaultValue={isEditForm ? target?.vdate ?? today() : today()}
                    required
                  />
                </div>
                <div className="lg:col-span-5">
                  <label className="label block mb-1">Party (Dr)</label>
                  <input
                    name="party"
                    list="adv-party-accts"
                    className="input-box mono"
                    defaultValue={isEditForm || isReissue ? target?.party ?? "" : ""}
                    placeholder="Party account…"
                  />
                </div>
                <div className="lg:col-span-4">
                  <label className="label block mb-1">
                    Cash Paid <span className="text-[9px] text-[var(--muted)]">(with these cheques)</span>
                  </label>
                  <input
                    name="cash_amt"
                    type="number"
                    step="any"
                    min="0"
                    className="input-box mono text-right"
                    defaultValue={isEditForm && editCash > 0 ? editCash : ""}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="overflow-x-auto border border-black">
                <table className="mono text-[12px]" style={{ minWidth: 1280 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>Sr#</th>
                      <th style={{ width: 170 }}>Bank Advance A/C (Cr)</th>
                      <th style={{ width: 230 }}>Advance Title</th>
                      <th style={{ width: 130 }}>Chq No</th>
                      <th style={{ width: 150 }}>Chq Date</th>
                      <th style={{ width: 130 }} className="text-right">Chq Amount</th>
                      <th style={{ width: 220 }}>Narration</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: LINE_ROWS }).map((_, i) => {
                      // Edit refills every cheque on the voucher; re-issue only
                      // seeds the first row from the bounced cheque.
                      const pf = isEditForm ? editRows[i] ?? null : i === 0 && isReissue ? target : null;
                      return (
                        <tr key={i}>
                          <td className="text-[var(--muted)] text-center">{i + 1}</td>
                          <td>
                            <select name="line_adv" className="input-box mono text-[12px]" defaultValue={pf?.bankAdv ?? ""}>
                              <option value="">— select —</option>
                              {advOpts.map((o) => (<option key={o.value} value={o.value}>{o.value} — {o.desc}</option>))}
                            </select>
                          </td>
                          <td><input name="line_adv_title" className="input-box text-[12px] bg-gray-50" defaultValue={pf ? descMap.get(pf.bankAdv) ?? "" : ""} readOnly tabIndex={-1} /></td>
                          {/* Carry the bounced number back. A bounced cheque physically
                              returns, so the same leaf is usually re-presented — and the
                              issue guard already allows it (bounces >= issues). Leaving
                              this blank was the only reason the number never came back;
                              operators were inventing "1122/1" to get past it. */}
                          <td><input name="line_chq_no" className="input-box mono text-[12px]" defaultValue={pf?.chqNo ?? ""} /></td>
                          <td><DateBox name="line_chq_date" className="input-box mono text-[12px]" defaultValue={pf?.chqDate ?? ""} /></td>
                          <td><input name="line_amt" type="number" step="any" min="0" className="input-box mono text-[12px] text-right" defaultValue={pf?.amount ?? ""} /></td>
                          <td><input name="line_narr" className="input-box text-[12px]" /></td>
                          <td className="text-center"><RowClearButton /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 mt-4 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">{isEditForm ? "Save Changes" : isReissue ? "Re-issue" : "Issue Cheque(s)"}</button>
                <a href={BASE} className="btn btn-outline btn-sm">Cancel</a>
                <span className="text-[11px] text-[var(--muted)] ml-2">Har line = ek cheque (Dr party / Cr bank-advance). Khali lines chhod dein.</span>
              </div>

                            <RowAutoFill watch="line_adv" map={advTitleMap} />
              <datalist id="adv-party-accts">
                {partyOpts.map((o) => (<option key={o.value} value={o.value}>{o.desc}</option>))}
              </datalist>
            </form>
          </div>
        )}

        {/* Clear form */}
        {isClearForm && target && (
          <div className="border-2 border-black p-4 mb-6">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-1">Mark Cleared — Cheque #{target.chqNo}</div>
            <div className="text-[12px] text-[var(--muted)] mono mb-4">
              Dr {target.bankAdv} ({descMap.get(target.bankAdv)}) &nbsp;/&nbsp; Cr Bank &nbsp;·&nbsp; {formatNum(target.amount)}
            </div>
            <form action={clearCheque} className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end gform">
              <input type="hidden" name="id" value={target.issueId} />
              <input type="hidden" name="chq" value={target.chqNo} />
              <div className="lg:col-span-6">
                <label className="label block mb-1">Bank A/C (Cr — jahan se paisa gaya)</label>
                <Combobox name="bank_acc" options={bankOpts} defaultValue="" placeholder="1.01.15.02.*" />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Clear Date</label>
                <DateBox name="clear_date" className="input-box mono" defaultValue={today()} />
              </div>
              <div className="lg:col-span-3 flex gap-2">
                <button type="submit" className="btn btn-sm flex-1">Confirm Clear</button>
                <a href={BASE} className="btn btn-outline btn-sm">Cancel</a>
              </div>
            </form>
          </div>
        )}

        {/* Bounce form */}
        {isBounceForm && target && (
          <div className="border-2 border-[var(--danger)] p-4 mb-6">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-1 text-[var(--danger)]">Mark Bounced — Cheque #{target.chqNo}</div>
            <div className="text-[12px] text-[var(--muted)] mono mb-4">
              Dr {target.bankAdv} ({descMap.get(target.bankAdv)}) &nbsp;/&nbsp; Cr Party CHQ-FAILLED &nbsp;·&nbsp; {formatNum(target.amount)}
            </div>
            <form action={bounceCheque} className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end gform">
              <input type="hidden" name="id" value={target.issueId} />
              <input type="hidden" name="chq" value={target.chqNo} />
              <div className="lg:col-span-5">
                <label className="label block mb-1">Cheque Dishonour A/C (Cr)</label>
                <Combobox name="dishonour_acc" options={dishonourOpts} defaultValue="" placeholder="1.01.15.04.* — party CHQ FAILLED" />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Bounce Date</label>
                <DateBox name="bounce_date" className="input-box mono" defaultValue={today()} />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Reason</label>
                <input name="reason" className="input-box" placeholder="Optional" />
              </div>
              <div className="lg:col-span-2 flex gap-2">
                <button type="submit" className="btn btn-sm flex-1" style={{ background: "var(--danger)", color: "white", borderColor: "var(--danger)" }}>Confirm Bounce</button>
                <a href={BASE} className="btn btn-outline btn-sm">Cancel</a>
              </div>
            </form>
          </div>
        )}

        {/* Find */}
        <form method="GET" action={BASE} className="mb-3 no-print flex gap-2 max-w-md">
          <input name="find" className="input-box mono flex-1" defaultValue={findFilter} placeholder="Cheque no / party" />
          <button type="submit" className="btn btn-outline btn-sm">Find</button>
          {findFilter && <a href={BASE} className="btn btn-outline btn-sm">Clear</a>}
        </form>

        {/* Register */}
        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">Advance Cheque Register</div>
          <div className="overflow-x-auto">
            <table style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>Chq No</th>
                  <th>Chq Date</th>
                  <th>Party</th>
                  <th>Bank Advance</th>
                  <th className="text-right">Chq Amount</th>
                  <th className="text-right">Cash</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th>Detail</th>
                  <th className="no-print text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={`${c.issueId}-${c.chqNo}`}>
                    <td className="mono text-[13px] font-bold">{c.vno}</td>
                    <td className="mono text-[13px]">{c.chqNo}</td>
                    <td className="mono text-[12px]">{c.chqDate || c.vdate}</td>
                    <td className="text-[13px]">
                      <span className="mono">{c.party}</span>
                      <span className="text-[11px] text-[var(--muted)] ml-1">— {descMap.get(c.party) ?? ""}</span>
                    </td>
                    <td className="text-[12px]">
                      <span className="mono">{c.bankAdv}</span>
                    </td>
                    <td className="mono text-right text-[13px]">{formatNum(c.amount)}</td>
                    <td className="mono text-right text-[13px]">{c.cash > 0 ? formatNum(c.cash) : "—"}</td>
                    <td className="mono text-right text-[13px] font-bold">{formatNum(c.amount + c.cash)}</td>
                    <td>{statusPill(c.status)}</td>
                    <td className="text-[11px] text-[var(--muted)]">
                      {c.status === "CLEARED" && <>via {descMap.get(c.clearBank ?? "") ?? c.clearBank} · {c.clearDate}</>}
                      {c.status === "BOUNCED" && <>to {descMap.get(c.dishonour ?? "") ?? c.dishonour} · {c.bounceDate}</>}
                      {c.status === "ISSUED" && "pending"}
                    </td>
                    <td className="no-print text-right whitespace-nowrap">
                      {c.status === "ISSUED" && (
                        <>
                          <a href={`${BASE}?action=edit&id=${c.issueId}`} className="btn btn-outline btn-sm mr-1" title="Edit this issue voucher — party, cheques, amounts, cash">Edit</a>
                          <a href={`${BASE}?action=clear&id=${c.issueId}&chq=${encodeURIComponent(c.chqNo)}`} className="btn btn-outline btn-sm mr-1">Clear</a>
                          <a href={`${BASE}?action=bounce&id=${c.issueId}&chq=${encodeURIComponent(c.chqNo)}`} className="btn btn-outline btn-sm mr-1">Bounce</a>
                        </>
                      )}
                      {c.status === "BOUNCED" && (
                        <a href={`${BASE}?action=reissue&id=${c.issueId}&chq=${encodeURIComponent(c.chqNo)}`} className="btn btn-outline btn-sm mr-1">Re-issue</a>
                      )}
                      {session?.roleName === "ADMIN" && (
                        <form action={deleteCheque} className="inline">
                          <input type="hidden" name="id" value={c.issueId} />
                          <ConfirmButton message="Delete this advance cheque and its clear/bounce postings?">Del</ConfirmButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center text-[13px] text-[var(--muted)] py-6">
                      No advance cheques. Click <b>New Advance Cheque</b> above.
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
