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

    const parties = formData.getAll("line_party") as string[];
    const advs = formData.getAll("line_adv") as string[];
    const chqNos = formData.getAll("line_chq_no") as string[];
    const chqDates = formData.getAll("line_chq_date") as string[];
    const amounts = formData.getAll("line_amt") as string[];
    const narrs = formData.getAll("line_narr") as string[];

    const rowCount = Math.max(parties.length, advs.length, amounts.length);
    const lines: { party: string; adv: string; chqNo: string; chqDate: string | null; amount: number; narration: string | null }[] = [];
    for (let i = 0; i < rowCount; i++) {
      const party = (parties[i] ?? "").trim();
      const adv = (advs[i] ?? "").trim();
      const chqNo = (chqNos[i] ?? "").trim();
      const amount = num(amounts[i]);
      // Fully-empty row → skip.
      if (!party && !adv && !chqNo && amount === null) continue;
      if (!party || !adv || !chqNo || amount === null || amount <= 0) {
        redirect(`${BASE}?error=invalid&adding=1`);
      }
      lines.push({ party, adv, chqNo, chqDate: (chqDates[i] ?? "").trim() || null, amount: amount!, narration: (narrs[i] ?? "").trim() || null });
    }
    if (!lines.length) redirect(`${BASE}?error=invalid&adding=1`);

    await assertPeriodOpen(vdate, "FINANCE");

    // Duplicate cheque numbers within the batch.
    const seen = new Set<string>();
    for (const l of lines) {
      if (seen.has(l.chqNo)) redirect(`${BASE}?error=dup_chq&adding=1`);
      seen.add(l.chqNo);
    }

    if (!(await validAccounts(lines.flatMap((l) => [l.party, l.adv])))) {
      redirect(`${BASE}?error=bad_account&adding=1`);
    }

    // Cheque numbers already used on an existing ADV issue.
    const clash = await db
      .select({ chqNo: schema.transDetail.chqNo })
      .from(schema.transMain)
      .innerJoin(
        schema.transDetail,
        and(
          eq(schema.transDetail.fyCode, schema.transMain.fyCode),
          eq(schema.transDetail.vtype, schema.transMain.vtype),
          eq(schema.transDetail.vno, schema.transMain.vno),
        ),
      )
      .where(and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.trnType, "ISSUE"), inArray(schema.transDetail.chqNo, Array.from(seen))))
      .limit(1);
    if (clash.length) redirect(`${BASE}?error=dup_chq&adding=1`);

    const fyCode = await currentFy();
    if (!fyCode) redirect(`${BASE}?error=no_fy&adding=1`);
    const vtime = nowTime();

    await db.transaction(async (tx) => {
      let vno = await nextVno(tx, fyCode);
      for (const l of lines) {
        const narr = `ADVANCE CHQ ISSUE #${l.chqNo}${l.chqDate ? ` DT ${l.chqDate}` : ""}${l.narration ? ` — ${l.narration}` : ""}`;
        await tx.insert(schema.transMain).values({
          fyCode, vtype: VTYPE, vno, vdate, vtime,
          accCode: l.party, trnType: "ISSUE", narration: narr, balanceAmount: l.amount, utCode,
        });
        await tx.insert(schema.transDetail).values([
          { fyCode, vtype: VTYPE, vno, srno: 1, accCode: l.party, partyCode: l.adv, narration: narr, debit: l.amount, credit: 0, chqNo: l.chqNo, chqDate: l.chqDate },
          { fyCode, vtype: VTYPE, vno, srno: 2, accCode: l.adv, partyCode: l.party, narration: narr, debit: 0, credit: l.amount, chqNo: l.chqNo, chqDate: l.chqDate },
        ]);
        vno++;
      }
    });
    revalidatePath(BASE);
    redirect(BASE);
  } catch (e) {
    periodRedirect(e);
  }
}

/** Load an ISSUE voucher's economics for a transition. */
async function loadIssue(id: number) {
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
  const crLine = lines.find((l) => (l.credit ?? 0) > 0);
  if (!drLine || !crLine) return null;
  return {
    main,
    party: drLine.accCode,
    bankAdv: crLine.accCode,
    chqNo: drLine.chqNo ?? "",
    chqDate: drLine.chqDate ?? "",
    amount: drLine.debit ?? 0,
  };
}

/** Has this cheque already been cleared or bounced? */
async function transitionExists(fyCode: string, chqNo: string, phase: "CLEAR" | "BOUNCE"): Promise<boolean> {
  if (!chqNo) return false;
  const rows = await db
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
    .where(and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.trnType, phase), eq(schema.transDetail.chqNo, chqNo)))
    .limit(1);
  return rows.length > 0;
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

    const issue = await loadIssue(id!);
    if (!issue) redirect(`${BASE}?error=not_found`);
    await assertPeriodOpen(clearDate, "FINANCE");
    if (await transitionExists(issue!.main.fyCode, issue!.chqNo, "CLEAR")) redirect(`${BASE}?error=already_cleared&id=${id}`);
    if (await transitionExists(issue!.main.fyCode, issue!.chqNo, "BOUNCE")) redirect(`${BASE}?error=already_bounced&id=${id}`);
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

    const issue = await loadIssue(id!);
    if (!issue) redirect(`${BASE}?error=not_found`);
    await assertPeriodOpen(bounceDate, "FINANCE");
    if (await transitionExists(issue!.main.fyCode, issue!.chqNo, "CLEAR")) redirect(`${BASE}?error=already_cleared&id=${id}`);
    if (await transitionExists(issue!.main.fyCode, issue!.chqNo, "BOUNCE")) redirect(`${BASE}?error=already_bounced&id=${id}`);
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
  const { fyCode } = issue.main;
  const chqNo = issue.chqNo;

  // vnos of this cheque's issue + any clear/bounce sharing the chq no.
  const related = await db
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
    .where(and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.fyCode, fyCode), eq(schema.transDetail.chqNo, chqNo)));
  const vnos = Array.from(new Set(related.map((r) => r.vno)));
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
  status: "ISSUED" | "CLEARED" | "BOUNCED";
  clearBank?: string;
  clearDate?: string;
  dishonour?: string;
  bounceDate?: string;
};

export default async function AdvanceChequePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; action?: string; error?: string; find?: string; thru?: string }>;
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
  const partyTitleMap = Object.fromEntries(partyOpts.map((o) => [o.value, { line_party_title: o.desc }]));
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
    const cr = ls.find((l) => (l.credit ?? 0) > 0);
    return { dr, cr, chqNo: (dr?.chqNo ?? cr?.chqNo ?? "").trim(), amount: dr?.debit ?? 0 };
  };

  const clearByChq = new Map<string, ReturnType<typeof info> & { vdate: string }>();
  const bounceByChq = new Map<string, ReturnType<typeof info> & { vdate: string }>();
  for (const m of mains) {
    if (m.trnType === "CLEAR") clearByChq.set(info(m.vno).chqNo, { ...info(m.vno), vdate: m.vdate });
    if (m.trnType === "BOUNCE") bounceByChq.set(info(m.vno).chqNo, { ...info(m.vno), vdate: m.vdate });
  }

  const cheques: Chq[] = mains
    .filter((m) => m.trnType === "ISSUE")
    .map((m) => {
      const it = info(m.vno);
      const cl = clearByChq.get(it.chqNo);
      const bo = bounceByChq.get(it.chqNo);
      const status: Chq["status"] = bo ? "BOUNCED" : cl ? "CLEARED" : "ISSUED";
      return {
        issueId: m.id,
        vno: m.vno,
        vdate: m.vdate,
        chqNo: it.chqNo,
        chqDate: it.dr?.chqDate ?? "",
        party: it.dr?.accCode ?? "",
        bankAdv: it.cr?.accCode ?? "",
        amount: it.amount,
        status,
        clearBank: cl?.cr?.accCode,
        clearDate: cl?.vdate,
        dishonour: bo?.cr?.accCode,
        bounceDate: bo?.vdate,
      };
    });

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
  const target = hasId ? cheques.find((c) => c.issueId === idParam) ?? null : null;

  const ERR: Record<string, string> = {
    invalid: "Each line needs a party, bank-advance account, cheque no. and a positive amount. Add at least one line.",
    bad_account: "One or more account codes are unknown or not a detail (level 4+) account.",
    dup_chq: "This cheque number is already issued. Use a different number.",
    no_fy: "Company fiscal year is not configured.",
    not_found: "Cheque not found.",
    already_cleared: "This cheque is already cleared.",
    already_bounced: "This cheque is already bounced.",
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

  const showIssueForm = isAdding || isReissue;

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
              {isReissue ? "Re-issue Advance Cheque (fresh cheque no, prefilled from bounced cheque)" : "New Advance Cheque — Issue (add multiple parties / cheques)"}
            </div>
            <form action={issueCheques}>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3 gform mb-4">
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Date</label>
                  <input name="v_date" type="date" className="input-box mono" defaultValue={today()} required />
                </div>
              </div>

              <div className="overflow-x-auto border border-black">
                <table className="mono text-[12px]" style={{ minWidth: 1280 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>Sr#</th>
                      <th style={{ width: 150 }}>Party (Dr)</th>
                      <th style={{ width: 210 }}>Party Title</th>
                      <th style={{ width: 150 }}>Bank Advance A/C (Cr)</th>
                      <th style={{ width: 210 }}>Advance Title</th>
                      <th style={{ width: 120 }}>Chq No</th>
                      <th style={{ width: 140 }}>Chq Date</th>
                      <th style={{ width: 120 }} className="text-right">Amount</th>
                      <th style={{ width: 170 }}>Narration</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: LINE_ROWS }).map((_, i) => {
                      const pf = i === 0 && isReissue ? target : null;
                      return (
                        <tr key={i}>
                          <td className="text-[var(--muted)] text-center">{i + 1}</td>
                          <td><input name="line_party" list="adv-party-accts" className="input-box mono text-[12px]" defaultValue={pf?.party ?? ""} /></td>
                          <td><input name="line_party_title" className="input-box text-[12px] bg-gray-50" defaultValue={pf ? descMap.get(pf.party) ?? "" : ""} readOnly tabIndex={-1} /></td>
                          <td>
                            <select name="line_adv" className="input-box mono text-[12px]" defaultValue={pf?.bankAdv ?? ""}>
                              <option value="">— select —</option>
                              {advOpts.map((o) => (<option key={o.value} value={o.value}>{o.value} — {o.desc}</option>))}
                            </select>
                          </td>
                          <td><input name="line_adv_title" className="input-box text-[12px] bg-gray-50" defaultValue={pf ? descMap.get(pf.bankAdv) ?? "" : ""} readOnly tabIndex={-1} /></td>
                          <td><input name="line_chq_no" className="input-box mono text-[12px]" /></td>
                          <td><input name="line_chq_date" type="date" className="input-box mono text-[12px]" /></td>
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
                <button type="submit" className="btn btn-sm">{isReissue ? "Re-issue" : "Issue Cheque(s)"}</button>
                <a href={BASE} className="btn btn-outline btn-sm">Cancel</a>
                <span className="text-[11px] text-[var(--muted)] ml-2">Har line = ek cheque (Dr party / Cr bank-advance). Khali lines chhod dein.</span>
              </div>

              <RowAutoFill watch="line_party" map={partyTitleMap} />
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
              <div className="lg:col-span-6">
                <label className="label block mb-1">Bank A/C (Cr — jahan se paisa gaya)</label>
                <Combobox name="bank_acc" options={bankOpts} defaultValue="" placeholder="1.01.15.02.*" />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Clear Date</label>
                <input name="clear_date" type="date" className="input-box mono" defaultValue={today()} />
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
              <div className="lg:col-span-5">
                <label className="label block mb-1">Cheque Dishonour A/C (Cr)</label>
                <Combobox name="dishonour_acc" options={dishonourOpts} defaultValue="" placeholder="1.01.15.04.* — party CHQ FAILLED" />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Bounce Date</label>
                <input name="bounce_date" type="date" className="input-box mono" defaultValue={today()} />
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
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Detail</th>
                  <th className="no-print text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.issueId}>
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
                    <td>{statusPill(c.status)}</td>
                    <td className="text-[11px] text-[var(--muted)]">
                      {c.status === "CLEARED" && <>via {descMap.get(c.clearBank ?? "") ?? c.clearBank} · {c.clearDate}</>}
                      {c.status === "BOUNCED" && <>to {descMap.get(c.dishonour ?? "") ?? c.dishonour} · {c.bounceDate}</>}
                      {c.status === "ISSUED" && "pending"}
                    </td>
                    <td className="no-print text-right whitespace-nowrap">
                      {c.status === "ISSUED" && (
                        <>
                          <a href={`${BASE}?action=clear&id=${c.issueId}`} className="btn btn-outline btn-sm mr-1">Clear</a>
                          <a href={`${BASE}?action=bounce&id=${c.issueId}`} className="btn btn-outline btn-sm mr-1">Bounce</a>
                        </>
                      )}
                      {c.status === "BOUNCED" && (
                        <a href={`${BASE}?action=reissue&id=${c.issueId}`} className="btn btn-outline btn-sm mr-1">Re-issue</a>
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
                    <td colSpan={9} className="text-center text-[13px] text-[var(--muted)] py-6">
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
