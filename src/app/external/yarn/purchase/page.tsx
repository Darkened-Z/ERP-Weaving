import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowAutoFill, RowCalc } from "@/components/auto-fill";
import { TermSelect } from "@/components/term-select";
import { db, schema } from "@/db";
import { and, eq, ne, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { today as pkToday } from "@/lib/time";
import { assertPeriodOpen } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { ConfirmButton } from "@/components/confirm-button";
import { acc } from "@/lib/gl-accounts";

export const dynamic = "force-dynamic";

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const today = () => pkToday();

const round2 = (n: number) => Math.round(n * 100) / 100;

const LOOM_TYPES = ["SULZER", "RAPIER", "AIRJET", "PROJECTILE"];
const POSTING_OPTIONS = ["Y", "N"];

const LINE_ROWS = 4;

function nextVNo(rows: { vNo: string }[], prefix: string): string {
  const nums = rows
    .map((r) => {
      const m = r.vNo?.match(new RegExp("^" + prefix + "-(\\d+)$"));
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + "-" + String(next).padStart(4, "0");
}

export default async function YarnPurchaseVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";

  const findFilter = params.find?.trim();
  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = escFind ? `%${escFind}%` : "";

  const vouchers = findFilter
    ? await db
        .select()
        .from(schema.extYarnPurVoucher)
        .where(sql`
          ${schema.extYarnPurVoucher.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnPurVoucher.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnPurVoucher.broker} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnPurVoucher.loomType} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnPurVoucher.cont} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.extYarnPurVoucher.id))
    : await db
        .select()
        .from(schema.extYarnPurVoucher)
        .orderBy(desc(schema.extYarnPurVoucher.id));

  const selected = isEditing ? vouchers.find((v) => v.id === idParam) ?? null : null;
  const formVoucher = isAdding ? null : selected;

  const lines = formVoucher
    ? await db
        .select()
        .from(schema.extYarnPurVoucherLine)
        .where(eq(schema.extYarnPurVoucherLine.voucherId, formVoucher.id))
        .orderBy(schema.extYarnPurVoucherLine.id)
    : [];

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);

  // Only leaf/party accounts (level 4+) are selectable as party / broker.
  const partyAccounts = parties.filter((p) => p.level >= 4);
  const partyOpts = partyAccounts.map((p) => ({
    value: p.description,
    label: `${p.code} — ${p.description}`,
    desc: p.code,
  }));
  const descByCode: Record<string, string> = {};
  for (const p of parties) descByCode[p.code] = p.description;
  const codeByDesc = new Map(partyAccounts.map((p) => [p.description, p.code]));

  const countList = await db
    .select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.countCode);

  const purContracts = await db
    .select()
    .from(schema.extYarnPurContract)
    .orderBy(desc(schema.extYarnPurContract.contNo));

  // Bags already received per contract (all vouchers except the one being edited).
  const purAggByCont = await db
    .select({
      contNo: schema.extYarnPurVoucherLine.contNo,
      bags: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag}), 0)`,
    })
    .from(schema.extYarnPurVoucherLine)
    .where(formVoucher ? ne(schema.extYarnPurVoucherLine.voucherId, formVoucher.id) : undefined)
    .groupBy(schema.extYarnPurVoucherLine.contNo);
  const purBagsByCont: Record<string, number> = {};
  for (const r of purAggByCont) if (r.contNo) purBagsByCont[r.contNo] = r.bags;

  const contractOpts = purContracts
    .filter((c) => c.status === "R")
    .map((c) => ({
      value: c.contNo,
      label: `${c.contNo}${c.partyCode ? ` — ${descByCode[c.partyCode] ?? c.partyCode}` : ""}`,
    }));
  // Picking a contract in the header auto-fills the party/broker (comboboxes),
  // the brokerage %/bag, received/balance, and the read-only contract-info strip.
  const contractMap: Record<string, Record<string, string | number>> = {};
  for (const c of purContracts) {
    const received = purBagsByCont[c.contNo] ?? 0;
    contractMap[c.contNo] = {
      party: c.partyCode ? descByCode[c.partyCode] ?? c.partyCode : "",
      broker: c.broker ? descByCode[c.broker] ?? c.broker : "",
      per_bag: c.brokagePerBag ?? "",
      pur: received,
      bal: (c.qtyBags ?? 0) - received,
      ci_rate: c.ratePerLbs ?? "",
      ci_age: c.agePercent ?? "",
      ci_days: c.days ?? "",
      ci_qty: c.qtyBags ?? "",
      ci_date: c.contDate ?? "",
      ci_remarks: c.remarks ?? "",
    };
  }
  // Line-grid fills: picking a contract # in a row fills that row's count/brand/rate.
  const lineContractMap: Record<string, Record<string, string | number>> = {};
  for (const c of purContracts) {
    lineContractMap[c.contNo] = {
      line_count: c.countCode ?? "",
      line_brand: c.brand ?? "",
      line_rate: c.ratePerLbs ?? "",
    };
  }

  const nextVNoVal = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extYarnPurVoucher.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.extYarnPurVoucher);
  const upcomingVNo = "YPV-" + String((nextVNoVal[0]?.m ?? 0) + 1).padStart(4, "0");
  const lastVNoNum = nextVNoVal[0]?.m ?? 0;

  const savedContract = formVoucher?.cont
    ? purContracts.find((c) => c.contNo === formVoucher.cont)
    : undefined;
  const savedPur = savedContract ? purBagsByCont[savedContract.contNo] ?? 0 : null;
  const savedBal = savedContract ? (savedContract.qtyBags ?? 0) - (savedPur ?? 0) : null;

  let salAvgRateCalc: number | null = null;
  if (formVoucher?.party) {
    const agg = await db
      .select({
        wsum: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs} * ${schema.extYarnSalVoucherLine.rate}), 0)`,
        bsum: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)`,
      })
      .from(schema.extYarnSalVoucherLine)
      .innerJoin(
        schema.extYarnSalVoucher,
        eq(schema.extYarnSalVoucherLine.voucherId, schema.extYarnSalVoucher.id)
      )
      .where(eq(schema.extYarnSalVoucher.party, formVoucher.party));
    const { wsum, bsum } = agg[0] ?? { wsum: 0, bsum: 0 };
    salAvgRateCalc = bsum > 0 ? round2(wsum / bsum) : null;
  }

  const countDefaultMap: Record<string, Record<string, string | number>> = {};
  for (const c of countList) countDefaultMap[String(c.code)] = { line_pack: 24, line_count_desc: c.description ?? "" };

  async function saveVoucher(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const vDate = ((formData.get("v_date") as string) || "").trim() || today();
    const loomType = txt(formData.get("loom_type"));
    const bmParty = txt(formData.get("bm_party"));
    const party = txt(formData.get("party"));
    const broker = txt(formData.get("broker"));
    const type = txt(formData.get("type")) ?? "PUR";
    const term = txt(formData.get("term")) ?? "CASH";
    const dueDate = term === "DUE" ? txt(formData.get("due_date")) : null;
    const posting = txt(formData.get("posting")) ?? "N";
    const img = txt(formData.get("img"));
    const cont = txt(formData.get("cont"));
    const pur = num(formData.get("pur"));
    const bal = num(formData.get("bal"));
    const salAvgRate = num(formData.get("sal_avg_rate"));
    const purAvgRate = num(formData.get("pur_avg_rate"));
    const percent = num(formData.get("percent"));
    const perBag = num(formData.get("per_bag"));
    const rkd = num(formData.get("rkd"));
    const lotNo = txt(formData.get("lot_no"));
    const pendingFinance = txt(formData.get("pending_finance"));

    const contNos = formData.getAll("line_cont_no") as string[];
    const counts = formData.getAll("line_count") as string[];
    const partyCounts = formData.getAll("line_party_count") as string[];
    const blds = formData.getAll("line_bld") as string[];
    const packs = formData.getAll("line_pack") as string[];
    const brands = formData.getAll("line_brand") as string[];
    const doNos = formData.getAll("line_do_no") as string[];
    const qtys = formData.getAll("line_qty") as string[];
    const bags = formData.getAll("line_bag") as string[];
    const cons = formData.getAll("line_con") as string[];
    const lbss = formData.getAll("line_lbs") as string[];
    const units = formData.getAll("line_unit") as string[];
    const dspParties = formData.getAll("line_despatch_party") as string[];
    const rates = formData.getAll("line_rate") as string[];
    const rateSvs = formData.getAll("line_rate_sv") as string[];

    const validLines: {
      contNo: string | null;
      count: string | null;
      partyCount: string | null;
      bld: string | null;
      pack: string | null;
      brand: string | null;
      doNo: string | null;
      qty: number | null;
      bag: number | null;
      con: number | null;
      lbs: number | null;
      unit: string | null;
      despatchParty: string | null;
      rate: number | null;
      rateSv: number | null;
    }[] = [];

    const rowCount = Math.max(
      contNos.length, counts.length, partyCounts.length, blds.length, packs.length,
      brands.length, doNos.length, qtys.length, bags.length, cons.length,
      lbss.length, units.length, dspParties.length, rates.length, rateSvs.length
    );

    for (let i = 0; i < rowCount; i++) {
      const c = (contNos[i] || "").trim();
      const ct = (counts[i] || "").trim();
      const pc = (partyCounts[i] || "").trim();
      const bl = (blds[i] || "").trim();
      const pk = (packs[i] || "").trim();
      const br = (brands[i] || "").trim();
      const dn = (doNos[i] || "").trim();
      const q = num(qtys[i]);
      const b = num(bags[i]);
      const co = num(cons[i]);
      const l = num(lbss[i]);
      const u = (units[i] || "").trim();
      const dp = (dspParties[i] || "").trim();
      const rt = num(rates[i]);
      const rs = num(rateSvs[i]);

      if (!c && !ct && !pc && !bl && !pk && !br && !dn && q == null && b == null && co == null && l == null && !u && !dp && rt == null && rs == null) {
        continue;
      }

      validLines.push({
        contNo: c || null,
        count: ct || null,
        partyCount: pc || null,
        bld: bl || null,
        pack: pk || null,
        brand: br || null,
        doNo: dn || null,
        qty: q,
        bag: b,
        con: co,
        lbs: l,
        unit: u || null,
        despatchParty: dp || null,
        rate: rt,
        rateSv: rs,
      });
    }

    if (!validLines.some((l) => (l.bag ?? 0) > 0 || (l.lbs ?? 0) > 0)) {
      redirect(
        Number.isFinite(id) && id > 0
          ? `/external/yarn/purchase?id=${id}&error=no_lines`
          : `/external/yarn/purchase?error=no_lines`
      );
    }

    const nowIso = new Date().toISOString();

    const VTYPE = "YPV";
    const [company] = await db
      .select({ currentFy: schema.companyProfile.currentFy })
      .from(schema.companyProfile)
      .limit(1);
    const fyCode = company?.currentFy ?? "";

    const partyRows = await db
      .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts)
      .where(sql`${schema.chartOfAccounts.level} >= 4`);
    const codeByDescSrv = new Map(partyRows.map((p) => [p.description, p.code]));
    const resolvePartyCoa = (p: string | null | undefined): string => {
      if (!p) return "";
      const s = p.trim();
      if (/^\d+(\.\d+)+$/.test(s)) return s;
      return codeByDescSrv.get(s) ?? "";
    };
    const partyCoa = resolvePartyCoa(party);
    const total = round2(validLines.reduce((s, l) => s + (l.lbs ?? 0) * (l.rate ?? 0), 0));
    const canPostGL = !!fyCode && !!partyCoa && total > 0;
    const yarnPurStockAcc = canPostGL ? await acc("YARN_PURCHASE_STOCK") : "";

    const assertBalanced = (details: (typeof schema.transDetail.$inferInsert)[]) => {
      const d = details.reduce((s, x) => s + (x.debit ?? 0), 0);
      const c = details.reduce((s, x) => s + (x.credit ?? 0), 0);
      if (Math.abs(d - c) >= 0.01) throw new Error("Unbalanced voucher");
    };

    try {
      await assertPeriodOpen(vDate, "INVENTORY");

      if (Number.isFinite(id) && id > 0) {
        const [existing] = await db
          .select({ lvNo: schema.extYarnPurVoucher.lvNo })
          .from(schema.extYarnPurVoucher)
          .where(eq(schema.extYarnPurVoucher.id, id));
        const existingLvNo = existing?.lvNo ?? 0;

        await db.transaction(async (tx) => {
          await tx
            .update(schema.extYarnPurVoucher)
            .set({
              vDate, type, loomType, bmParty, party, broker, term, dueDate, posting, img, cont, pur, bal,
              salAvgRate, purAvgRate, percent, perBag, rkd, lotNo, pendingFinance,
              modifiedDate: nowIso,
            })
            .where(eq(schema.extYarnPurVoucher.id, id));

          await tx
            .delete(schema.extYarnPurVoucherLine)
            .where(eq(schema.extYarnPurVoucherLine.voucherId, id));

          if (validLines.length) {
            await tx
              .insert(schema.extYarnPurVoucherLine)
              .values(validLines.map((l) => ({ ...l, voucherId: id })));
          }

          if (existingLvNo > 0) {
            await tx.delete(schema.transDetail).where(
              and(eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.vno, existingLvNo))
            );
            await tx.delete(schema.transMain).where(
              and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.vno, existingLvNo))
            );
          }

          if (canPostGL && existingLvNo > 0) {
            await tx.insert(schema.transMain).values({
              fyCode,
              vtype: VTYPE,
              vno: existingLvNo,
              vdate: vDate,
              accCode: partyCoa,
              narration: `Cont#${cont ?? ""} ${party ?? ""}`.trim(),
              balanceAmount: total,
            });
            const details: (typeof schema.transDetail.$inferInsert)[] = [
              {
                fyCode, vtype: VTYPE, vno: existingLvNo, srno: 1,
                accCode: yarnPurStockAcc, partyCode: partyCoa, contNo: cont,
                narration: `Yarn purchase ${cont ?? ""}`.trim(),
                debit: total, credit: 0,
              },
              {
                fyCode, vtype: VTYPE, vno: existingLvNo, srno: 2,
                accCode: partyCoa, partyCode: partyCoa, contNo: cont,
                narration: `Yarn purchase ${cont ?? ""}`.trim(),
                debit: 0, credit: total,
              },
            ];
            assertBalanced(details);
            await tx.insert(schema.transDetail).values(details);
          }
        });

        revalidatePath("/external/yarn/purchase");
        redirect(`/external/yarn/purchase?id=${id}`);
      } else {
        const providedVNo = ((formData.get("v_no") as string) || "").trim();

        let newId = 0;
        let codeExists = false;
        try {
          newId = await db.transaction(async (tx) => {
            const existingRows = await tx.select({ vNo: schema.extYarnPurVoucher.vNo }).from(schema.extYarnPurVoucher);
            const vNo = providedVNo || nextVNo(existingRows, "YPV");
            const lvRow = await tx
              .select({ m: sql<number>`coalesce(max(${schema.extYarnPurVoucher.lvNo}), 0)` })
              .from(schema.extYarnPurVoucher);
            const nextL = (lvRow[0]?.m ?? 0) + 1;

            const inserted = await tx
              .insert(schema.extYarnPurVoucher)
              .values({
                vNo, lvNo: nextL, vDate, type, posting, loomType, bmParty, party, broker,
                term, dueDate, img, cont, pur, bal, salAvgRate, purAvgRate, percent, perBag, rkd, lotNo,
                pendingFinance, postedDate: nowIso,
              })
              .returning({ id: schema.extYarnPurVoucher.id });
            const insertedId = inserted[0].id;

            if (validLines.length) {
              await tx
                .insert(schema.extYarnPurVoucherLine)
                .values(validLines.map((l) => ({ ...l, voucherId: insertedId })));
            }

            await tx.delete(schema.transDetail).where(
              and(eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.vno, nextL))
            );
            await tx.delete(schema.transMain).where(
              and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.vno, nextL))
            );

            if (canPostGL) {
              await tx.insert(schema.transMain).values({
                fyCode,
                vtype: VTYPE,
                vno: nextL,
                vdate: vDate,
                accCode: partyCoa,
                narration: `Cont#${cont ?? ""} ${party ?? ""}`.trim(),
                balanceAmount: total,
              });
              const details: (typeof schema.transDetail.$inferInsert)[] = [
                {
                  fyCode, vtype: VTYPE, vno: nextL, srno: 1,
                  accCode: yarnPurStockAcc, partyCode: partyCoa, contNo: cont,
                  narration: `Yarn purchase ${cont ?? ""}`.trim(),
                  debit: total, credit: 0,
                },
                {
                  fyCode, vtype: VTYPE, vno: nextL, srno: 2,
                  accCode: partyCoa, partyCode: partyCoa, contNo: cont,
                  narration: `Yarn purchase ${cont ?? ""}`.trim(),
                  debit: 0, credit: total,
                },
              ];
              assertBalanced(details);
              await tx.insert(schema.transDetail).values(details);
            }
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
          redirect(`/external/yarn/purchase?error=code_exists`);
        }

        revalidatePath("/external/yarn/purchase");
        redirect(`/external/yarn/purchase?id=${newId}`);
      }
    } catch (e: unknown) {
      const digest = (e as { digest?: string })?.digest ?? "";
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e;
      const msg = (e as { message?: string })?.message ?? "";
      const m = /Period locked through (\d{4}-\d{2}-\d{2})/.exec(msg);
      if (m) {
        redirect(`/external/yarn/purchase?error=period_locked&thru=${m[1]}`);
      }
      throw e;
    }
  }

  async function deleteVoucher(formData: FormData) {
    "use server";
    const s = await getSession();
    if (s?.roleName !== "ADMIN") redirect("/external/yarn/purchase?error=admin_only");
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    const [existing] = await db
      .select({ lvNo: schema.extYarnPurVoucher.lvNo })
      .from(schema.extYarnPurVoucher)
      .where(eq(schema.extYarnPurVoucher.id, id));
    const lvNo = existing?.lvNo ?? 0;
    await db.transaction(async (tx) => {
      if (lvNo > 0) {
        await tx.delete(schema.transDetail).where(
          and(eq(schema.transDetail.vtype, "YPV"), eq(schema.transDetail.vno, lvNo))
        );
        await tx.delete(schema.transMain).where(
          and(eq(schema.transMain.vtype, "YPV"), eq(schema.transMain.vno, lvNo))
        );
      }
      await tx.delete(schema.extYarnPurVoucherLine).where(eq(schema.extYarnPurVoucherLine.voucherId, id));
      await tx.delete(schema.extYarnPurVoucher).where(eq(schema.extYarnPurVoucher.id, id));
    });
    revalidatePath("/external/yarn/purchase");
    redirect("/external/yarn/purchase");
  }

  async function setOk(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db
      .update(schema.extYarnPurVoucher)
      .set({ statusOk: "OK" })
      .where(eq(schema.extYarnPurVoucher.id, id));
    revalidatePath("/external/yarn/purchase");
    redirect(`/external/yarn/purchase?id=${id}`);
  }

  async function clearOk(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db
      .update(schema.extYarnPurVoucher)
      .set({ statusOk: null })
      .where(eq(schema.extYarnPurVoucher.id, id));
    revalidatePath("/external/yarn/purchase");
    redirect(`/external/yarn/purchase?id=${id}`);
  }

  const emptySlots = Math.max(LINE_ROWS - lines.length, 3);
  const gridRows: (typeof lines[number] | null)[] = [
    ...lines,
    ...Array.from({ length: emptySlots }, () => null),
  ];

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const totals = vouchers.reduce(
    (a, v) => {
      a.pur += v.pur ?? 0;
      a.bal += v.bal ?? 0;
      return a;
    },
    { pur: 0, bal: 0 }
  );

  return (
    <Shell active="ext-yp-vch">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">YARN PURCHASE</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {vouchers.length} voucher{vouchers.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={vouchers.map((v) => ({
              vNo: v.vNo,
              vDate: v.vDate,
              party: v.party,
              broker: v.broker,
              loomType: v.loomType,
              term: v.term,
              cont: v.cont,
              pur: v.pur,
              bal: v.bal,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "party", label: "Party" },
              { key: "broker", label: "Broaker" },
              { key: "loomType", label: "Loom Type" },
              { key: "term", label: "Term" },
              { key: "cont", label: "Cont" },
              { key: "pur", label: "Pur" },
              { key: "bal", label: "Bal" },
            ]}
            filename="yarn-purchase-vouchers"
            sheetName="YarnPurchase"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-3">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{vouchers.length}</div>
            <div className="stat-label">Total Vouchers</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{formatNum(totals.pur)}</div>
            <div className="stat-label">Total Pur</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{formatNum(totals.bal)}</div>
            <div className="stat-label">Total Bal</div>
          </div>
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Voucher number already exists. Try again.
          </div>
        )}
        {params.error === "no_lines" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            At least one line with Bag or Lbs is required. Nothing was saved.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Period locked through {params.thru ?? "?"}. Nothing was saved.
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can delete vouchers.
          </div>
        )}

        <datalist id="ypv-parties">
          {partyAccounts.map((p) => (
            <option key={p.code} value={p.description}>
              {p.code}
            </option>
          ))}
        </datalist>
        <datalist id="ypv-counts">
          {countList.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.description}
            </option>
          ))}
        </datalist>
        <datalist id="ypv-contracts">
          {purContracts.map((c) => (
            <option key={c.contNo} value={c.contNo}>
              {c.contNo}
            </option>
          ))}
        </datalist>

        <form
          id="ypv-find-form"
          method="GET"
          action="/external/yarn/purchase"
          className="hidden"
        ></form>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-3">
          <div className="lg:col-span-3">
            <div className="border border-black p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding
                    ? "New — YARN PURCHASE"
                    : formVoucher
                    ? `Edit — ${formVoucher.vNo}`
                    : "YARN PURCHASE"}
                </div>
                <div className="flex gap-2 no-print flex-wrap">
                  <a href="/external/yarn/purchase?adding=1" className="btn btn-outline btn-sm">
                    New
                  </a>
                  <button type="submit" form="ypv-save-form" className="btn btn-sm">
                    Save
                  </button>
                  <PrintButton label="Print" />
                  {formVoucher && (
                    <form action={deleteVoucher} className="inline">
                      <input type="hidden" name="id" value={formVoucher.id} />
                      <ConfirmButton>Del</ConfirmButton>
                    </form>
                  )}
                  <a href="/external/yarn/purchase" className="btn btn-outline btn-sm">
                    Exit
                  </a>
                </div>
              </div>

              <form id="ypv-save-form" action={saveVoucher}>
                {formVoucher && <input type="hidden" name="id" value={formVoucher.id} />}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Loom Type</label>
                    <select
                      name="loom_type"
                      className="input-box mono"
                      defaultValue={formVoucher?.loomType ?? "SULZER"}
                    >
                      {LOOM_TYPES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">V. No</label>
                    <input
                      name="v_no"
                      className="input-box mono bg-gray-100"
                      defaultValue={formVoucher?.vNo ?? upcomingVNo}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Date</label>
                    <input
                      name="v_date"
                      type="date"
                      className="input-box mono"
                      defaultValue={formVoucher?.vDate ?? today()}
                      required
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <label className="label block mb-1">Type</label>
                    <select
                      name="type"
                      className="input-box mono"
                      defaultValue={formVoucher?.type ?? "PUR"}
                    >
                      <option value="PUR">PURCHASE</option>
                      <option value="RET">RETURN</option>
                      <option value="CON">CONSIGNMENT</option>
                    </select>
                  </div>
                  <div className="lg:col-span-1">
                    <label className="label block mb-1">LV.No</label>
                    <input
                      className="input-box mono bg-gray-100 text-center"
                      defaultValue={formVoucher?.lvNo ?? lastVNoNum}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Pending Finance</label>
                    <input
                      name="pending_finance"
                      className="input-box mono bg-gray-100"
                      defaultValue={formVoucher?.pendingFinance ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Posted</label>
                    <input
                      className="input-box mono bg-gray-100 text-[12px]"
                      defaultValue={formVoucher?.postedDate?.slice(0, 10) ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Modified</label>
                    <input
                      className="input-box mono bg-gray-100 text-[12px]"
                      defaultValue={formVoucher?.modifiedDate?.slice(0, 10) ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Posting</label>
                    <select
                      name="posting"
                      className="input-box mono"
                      defaultValue={formVoucher?.posting ?? "Y"}
                    >
                      {POSTING_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Find Date</label>
                    <div className="flex gap-2">
                      <input
                        form="ypv-find-form"
                        name="find"
                        className="input-box mono flex-1"
                        defaultValue={params.find ?? ""}
                        placeholder="v.no / party / cont"
                      />
                      <button form="ypv-find-form" type="submit" className="btn btn-outline btn-sm">
                        Find
                      </button>
                    </div>
                  </div>
                  <div className="lg:col-span-3 flex items-end gap-2">
                    {formVoucher && (
                      <>
                        <button
                          type="submit"
                          formAction={clearOk}
                          formNoValidate
                          className="btn btn-outline btn-sm"
                          title="Clear OK status"
                        >
                          Clear-OK
                        </button>
                        <button
                          type="submit"
                          formAction={setOk}
                          formNoValidate
                          className="btn btn-outline btn-sm"
                          title="Mark voucher OK"
                        >
                          OK
                        </button>
                        {formVoucher.statusOk === "OK" && (
                          <span className="mono text-[11px] font-bold border border-black px-2 py-1">
                            OK
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <label className="label block mb-1">BM</label>
                    <input
                      name="bm_party"
                      className="input-box mono"
                      defaultValue={formVoucher?.bmParty ?? ""}
                    />
                  </div>
                  <div className="lg:col-span-10">
                    <label className="label block mb-1">Party</label>
                    <Combobox
                      name="party"
                      options={partyOpts}
                      defaultValue={formVoucher?.party ?? ""}
                      placeholder="Select party…"
                    />
                  </div>

                  <div className="lg:col-span-12">
                    <label className="label block mb-1">Broaker</label>
                    <Combobox
                      name="broker"
                      options={partyOpts}
                      defaultValue={formVoucher?.broker ?? ""}
                      placeholder="Select broker…"
                    />
                  </div>

                  <TermSelect
                    defaultTerm={formVoucher?.term ?? "CASH"}
                    defaultDate={formVoucher?.dueDate ?? ""}
                  />
                  <div className="lg:col-span-8">
                    <label className="label block mb-1">Img</label>
                    <input
                      name="img"
                      className="input-box mono"
                      defaultValue={formVoucher?.img ?? ""}
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Cont</label>
                    <Combobox
                      name="cont"
                      options={contractOpts}
                      defaultValue={formVoucher?.cont ?? ""}
                      placeholder="Contract #…"
                    />
                    <AutoFill
                      watch="cont"
                      map={contractMap}
                      combos={["party", "broker"]}
                      inputs={["per_bag", "pur", "bal", "ci_rate", "ci_age", "ci_days", "ci_qty", "ci_date", "ci_remarks"]}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Pur</label>
                    <input
                      name="pur"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={savedPur ?? formVoucher?.pur ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Bal</label>
                    <input
                      name="bal"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={savedBal ?? formVoucher?.bal ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Sal Avg Rate</label>
                    <input
                      name="sal_avg_rate"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={salAvgRateCalc ?? formVoucher?.salAvgRate ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">%/Bag</label>
                    <input
                      name="per_bag"
                      type="number"
                      step="any"
                      className="input-box mono"
                      defaultValue={formVoucher?.perBag ?? ""}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">R.K.D</label>
                    <input
                      name="rkd"
                      type="number"
                      step="any"
                      className="input-box mono"
                      defaultValue={formVoucher?.rkd ?? ""}
                    />
                  </div>

                  <div className="lg:col-span-1 flex items-end">
                    <span className="mono text-[11px] text-[var(--muted)] pb-2">F-9</span>
                  </div>
                  <div className="lg:col-span-11">
                    <label className="label block mb-1">Lot No</label>
                    <input
                      name="lot_no"
                      className="input-box mono"
                      defaultValue={formVoucher?.lotNo ?? ""}
                      placeholder="F9 lookup"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Pur Avg Rate</label>
                    <input
                      name="pur_avg_rate"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={formVoucher?.purAvgRate ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">%</label>
                    <input
                      name="percent"
                      type="number"
                      step="any"
                      className="input-box mono"
                      defaultValue={formVoucher?.percent ?? ""}
                    />
                  </div>
                </div>

                {(() => {
                  const ci = formVoucher?.cont ? contractMap[formVoucher.cont] : null;
                  return (
                <div className="mt-4 border border-[var(--border-light)] bg-[var(--surface)] p-3">
                  <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 text-[var(--muted)]">
                    Contract Info (auto — pick a contract above)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2">
                    <div>
                      <label className="label block mb-1">Cont Date</label>
                      <input name="ci_date" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={ci?.ci_date ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">Rate/Lbs</label>
                      <input name="ci_rate" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={ci?.ci_rate ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">Qty Bags</label>
                      <input name="ci_qty" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={ci?.ci_qty ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">Age %</label>
                      <input name="ci_age" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={ci?.ci_age ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">Days</label>
                      <input name="ci_days" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={ci?.ci_days ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">Remarks</label>
                      <input name="ci_remarks" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={ci?.ci_remarks ?? ""} />
                    </div>
                  </div>
                </div>
                  );
                })()}

                <div className="mt-6">
                  <RowAutoFill watch="line_cont_no" map={lineContractMap} />
                  <RowAutoFill watch="line_count" map={countDefaultMap} />
                  <RowCalc target="line_lbs" a="line_bag" factor={100} round={0} onlyWhenEmpty />
                  <RowCalc target="line_amt" a="line_lbs" b="line_rate" />
                  <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                    Line Items ({LINE_ROWS} rows)
                  </div>
                  <div className="overflow-x-auto border border-black">
                    <table style={{ minWidth: "1700px" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "30px" }}>#</th>
                          <th>Cont.#</th>
                          <th>Count</th>
                          <th>Count Desc</th>
                          <th>Party Count</th>
                          <th>Bld</th>
                          <th>Pack</th>
                          <th>Brand</th>
                          <th>DO.No</th>
                          <th>Qty</th>
                          <th>Bag</th>
                          <th>Con</th>
                          <th>Lbs</th>
                          <th>Unit</th>
                          <th>Despatch Party</th>
                          <th>Rate</th>
                          <th>Rate Sv</th>
                          <th>Amt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gridRows.map((row, i) => (
                          <tr key={row?.id ?? `e-${i}`}>
                            <td className="mono text-[11px] text-center text-[var(--muted)]">
                              {i + 1}
                            </td>
                            <td>
                              <input
                                name="line_cont_no"
                                list="ypv-contracts"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.contNo ?? ""}
                                style={{ width: 65 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_count"
                                list="ypv-counts"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.count ?? ""}
                                style={{ width: 60 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_count_desc"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.count ? (countList.find((c) => String(c.code) === String(row.count))?.description ?? "") : ""}
                                readOnly
                                tabIndex={-1}
                                style={{ minWidth: 160, background: "#f3f4f6" }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_party_count"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.partyCount ?? ""}
                                style={{ width: 65 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_bld"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.bld ?? ""}
                                style={{ width: 55 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_pack"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.pack ?? ""}
                                style={{ width: 60 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_brand"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.brand ?? ""}
                                style={{ width: 70 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_do_no"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.doNo ?? ""}
                                style={{ width: 70 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_qty"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px] text-right"
                                defaultValue={row?.qty ?? ""}
                                style={{ width: 70 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_bag"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px] text-right"
                                defaultValue={row?.bag ?? ""}
                                style={{ width: 65 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_con"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px] text-right"
                                defaultValue={row?.con ?? ""}
                                style={{ width: 60 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_lbs"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px] text-right"
                                defaultValue={row?.lbs ?? ""}
                                style={{ width: 75 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_unit"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.unit ?? ""}
                                style={{ width: 55 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_despatch_party"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.despatchParty ?? ""}
                                style={{ minWidth: 160 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_rate"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px] text-right"
                                defaultValue={row?.rate ?? ""}
                                style={{ width: 80 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_rate_sv"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px] text-right"
                                defaultValue={row?.rateSv ?? ""}
                                style={{ width: 80 }}
                              />
                            </td>
                            <td>
                              <input
                                name="line_amt"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px] bg-gray-100 text-right"
                                defaultValue={
                                  row?.lbs != null && row?.rate != null
                                    ? round2(row.lbs * row.rate)
                                    : ""
                                }
                                readOnly
                                tabIndex={-1}
                                style={{ width: 100 }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-2">
                    Empty rows are ignored on save. On update, all lines are replaced with the current grid.
                  </div>
                </div>

                <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                  <a href="/external/yarn/purchase?adding=1" className="btn btn-outline btn-sm">
                    New
                  </a>
                  <button type="submit" className="btn btn-sm">
                    Save
                  </button>
                  <PrintButton label="Print" />
                  <a href="/external/yarn/purchase" className="btn btn-outline btn-sm">
                    Exit
                  </a>
                  {formVoucher && (
                    <form action={deleteVoucher} className="inline">
                      <input type="hidden" name="id" value={formVoucher.id} />
                      <ConfirmButton>Del</ConfirmButton>
                    </form>
                  )}
                  <div className="ml-auto flex items-end gap-2">
                    <div>
                      <label className="label block mb-1">Alt-S Password</label>
                      <input className="input-box mono" placeholder="password" type="password" />
                    </div>
                  </div>
                </div>
              </form>

              {formVoucher && (
                <form action={deleteVoucher} className="inline mt-3">
                  <input type="hidden" name="id" value={formVoucher.id} />
                  <ConfirmButton>Delete</ConfirmButton>
                </form>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="border border-black">
              <div className="px-3 py-2 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
                Past Vouchers
              </div>
              <div className="overflow-x-auto" style={{ maxHeight: "600px", overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>V.#</th>
                      <th>Date</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.slice(0, 30).map((v) => {
                      const isSel = v.id === selected?.id;
                      const href = `/external/yarn/purchase?id=${v.id}`;
                      const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                      return (
                        <tr
                          key={v.id}
                          className={
                            isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"
                          }
                        >
                          <td className="mono text-[11px]">
                            <a href={href} className="no-underline block" style={linkStyle}>
                              {v.vNo}
                            </a>
                          </td>
                          <td className="mono text-[11px]">
                            <a href={href} className="no-underline block" style={linkStyle}>
                              {v.vDate}
                            </a>
                          </td>
                          <td className="text-right mono text-[11px]">
                            <a href={href} className="no-underline block" style={linkStyle}>
                              {formatNum(v.pur)}
                            </a>
                          </td>
                          <td className="text-right mono text-[11px]">
                            <a href={href} className="no-underline block" style={linkStyle}>
                              {formatNum(v.purAvgRate)}
                            </a>
                          </td>
                          <td className="text-right mono text-[11px]">
                            <a href={href} className="no-underline block" style={linkStyle}>
                              {formatNum((v.pur ?? 0) * (v.purAvgRate ?? 0))}
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                    {vouchers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-[11px] text-[var(--muted)] py-4">
                          No vouchers yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            All Vouchers
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Broaker</th>
                  <th>Loom Type</th>
                  <th>Term</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const isSel = v.id === selected?.id;
                  const href = `/external/yarn/purchase?id=${v.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr
                      key={v.id}
                      className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                    >
                      <td className="mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.vNo}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.vDate}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.party ?? "-"}
                          {v.party && codeByDesc.get(v.party) && (
                            <span className="block text-[11px] opacity-70">{codeByDesc.get(v.party)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.broker ?? "-"}
                          {v.broker && codeByDesc.get(v.broker) && (
                            <span className="block text-[11px] opacity-70">{codeByDesc.get(v.broker)}</span>
                          )}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.loomType ?? "-"}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.term ?? "-"}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {v.posting === "Y" ? "POSTED" : "PENDING"}
                          {v.statusOk === "OK" && (
                            <span className="ml-1 border border-current px-1 text-[10px] font-bold">
                              OK
                            </span>
                          )}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {vouchers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-[13px] text-[var(--muted)] py-6">
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
