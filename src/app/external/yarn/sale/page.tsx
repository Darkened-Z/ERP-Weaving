import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowAutoFill, RowCalc } from "@/components/auto-fill";
import { TermSelect } from "@/components/term-select";
import { db, schema } from "@/db";
import { eq, ne, sql, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

const today = () => new Date().toISOString().slice(0, 10);

const round2 = (n: number) => Math.round(n * 100) / 100;

const LOOM_TYPES = ["SULZER", "RAPIER", "AIRJET", "PROJECTILE"];
const POSTING_OPTIONS = ["Y", "N"];

const LINE_ROWS = 12;

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

export default async function YarnSaleVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string }>;
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
        .from(schema.extYarnSalVoucher)
        .where(sql`
          ${schema.extYarnSalVoucher.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnSalVoucher.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnSalVoucher.loomType} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnSalVoucher.cont} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.extYarnSalVoucher.id))
    : await db
        .select()
        .from(schema.extYarnSalVoucher)
        .orderBy(desc(schema.extYarnSalVoucher.id));

  const selected = isEditing ? vouchers.find((v) => v.id === idParam) ?? null : null;
  const formVoucher = isAdding ? null : selected;

  const lines = formVoucher
    ? await db
        .select()
        .from(schema.extYarnSalVoucherLine)
        .where(eq(schema.extYarnSalVoucherLine.voucherId, formVoucher.id))
        .orderBy(schema.extYarnSalVoucherLine.id)
    : [];

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);

  const partyAccounts = parties.filter((p) => p.level >= 4);
  const partyOpts = partyAccounts.map((p) => ({
    value: p.description,
    label: `${p.code} — ${p.description}`,
    desc: p.code,
  }));
  const descByCode: Record<string, string> = {};
  for (const p of parties) descByCode[p.code] = p.description;
  const codeByDesc = new Map(partyAccounts.map((p) => [p.description, p.code]));

  const salContracts = await db
    .select()
    .from(schema.extYarnSalContract)
    .orderBy(desc(schema.extYarnSalContract.contNo));

  // Bags already delivered per contract (all vouchers except the one being edited).
  const salAggByCont = await db
    .select({
      contNo: schema.extYarnSalVoucherLine.contNo,
      bags: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.bag}), 0)`,
    })
    .from(schema.extYarnSalVoucherLine)
    .where(formVoucher ? ne(schema.extYarnSalVoucherLine.voucherId, formVoucher.id) : undefined)
    .groupBy(schema.extYarnSalVoucherLine.contNo);
  const salBagsByCont: Record<string, number> = {};
  for (const r of salAggByCont) if (r.contNo) salBagsByCont[r.contNo] = r.bags;

  // Scope the contract picker to the currently-chosen party (Oracle: contracts open
  // only for their own party). When no party is chosen, show all open contracts.
  const savedPartyDesc = formVoucher?.party ?? "";
  const contractOpts = salContracts
    .filter((c) => c.status === "R")
    .filter(
      (c) =>
        !savedPartyDesc ||
        (c.partyCode && (descByCode[c.partyCode] === savedPartyDesc || c.partyCode === savedPartyDesc))
    )
    .map((c) => ({
      value: c.contNo,
      label: `${c.contNo}${c.partyCode ? ` — ${descByCode[c.partyCode] ?? c.partyCode}` : ""}`,
    }));
  const contractMap: Record<string, Record<string, string | number>> = {};
  for (const c of salContracts) {
    const delivered = salBagsByCont[c.contNo] ?? 0;
    contractMap[c.contNo] = {
      party: c.partyCode ? descByCode[c.partyCode] ?? c.partyCode : "",
      broker: c.broker ? descByCode[c.broker] ?? c.broker : "",
      pur: delivered,
      bal: (c.qtyBags ?? 0) - delivered,
      ci_rate: c.ratePerLbs ?? "",
      ci_age: c.agePercent ?? "",
      ci_days: c.days ?? "",
      ci_qty: c.qtyBags ?? "",
      ci_date: c.contDate ?? "",
      ci_remarks: c.remarks ?? "",
    };
  }
  const lineContractMap: Record<string, Record<string, string | number>> = {};
  for (const c of salContracts) {
    lineContractMap[c.contNo] = {
      line_count: c.countCode ?? "",
      line_brand: c.brand ?? "",
      line_rate: c.ratePerLbs ?? "",
    };
  }

  const countList = await db
    .select({ code: schema.yarnCounts.countCode, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.countCode);
  const countDefaultMap: Record<string, Record<string, string | number>> = {};
  const countBlendByCode: Record<string, string> = {};
  for (const c of countList) {
    countDefaultMap[String(c.code)] = { line_pack: 24 };
    if (c.type) countBlendByCode[String(c.code)] = c.type;
  }

  // Stock-per-count-per-godown: what's actually available to sell right now.
  // Purchases in (extYarnPurVoucherLine) minus sales out (extYarnSalVoucherLine)
  // grouped by (count, despatchParty). Excludes the voucher being edited so its
  // own lines don't self-deduct.
  const purByCountLoc = await db
    .select({
      count: schema.extYarnPurVoucherLine.count,
      loc: schema.extYarnPurVoucherLine.despatchParty,
      bag: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag}), 0)`,
      con: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.con}), 0)`,
      lbs: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs}), 0)`,
      wrate: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag} * ${schema.extYarnPurVoucherLine.rate}), 0)`,
    })
    .from(schema.extYarnPurVoucherLine)
    .groupBy(schema.extYarnPurVoucherLine.count, schema.extYarnPurVoucherLine.despatchParty);
  const salByCountLoc = await db
    .select({
      count: schema.extYarnSalVoucherLine.count,
      loc: schema.extYarnSalVoucherLine.despatchParty,
      bag: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.bag}), 0)`,
      con: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.cons}), 0)`,
      lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)`,
    })
    .from(schema.extYarnSalVoucherLine)
    .where(formVoucher ? ne(schema.extYarnSalVoucherLine.voucherId, formVoucher.id) : undefined)
    .groupBy(schema.extYarnSalVoucherLine.count, schema.extYarnSalVoucherLine.despatchParty);

  type Stock = { bag: number; con: number; lbs: number; avgRate: number };
  const stockKey = (c: string, l: string) => `${c}||${l}`;
  const stockMap = new Map<string, Stock>();
  for (const p of purByCountLoc) {
    if (!p.count) continue;
    const loc = p.loc ?? "";
    stockMap.set(stockKey(p.count, loc), {
      bag: p.bag,
      con: p.con,
      lbs: p.lbs,
      avgRate: p.bag > 0 ? round2(p.wrate / p.bag) : 0,
    });
  }
  for (const s of salByCountLoc) {
    if (!s.count) continue;
    const k = stockKey(s.count, s.loc ?? "");
    const cur = stockMap.get(k);
    if (!cur) continue;
    cur.bag -= s.bag;
    cur.con -= s.con;
    cur.lbs -= s.lbs;
  }

  // Build the enriched line-count picker: value is "count||despatchLoc" so each
  // (count, godown) combo is a distinct option. Only rows with balance > 0.
  type CountStockOpt = { value: string; label: string; desc?: string };
  const countStockOpts: CountStockOpt[] = [];
  const countStockFillMap: Record<string, Record<string, string | number>> = {};
  for (const [key, s] of stockMap.entries()) {
    if (s.bag <= 0 && s.lbs <= 0) continue;
    const [c, loc] = key.split("||");
    const blend = countBlendByCode[c] ?? "";
    const label = `${c} ${blend ? `(${blend})` : ""} — bal ${s.bag.toFixed(2)} bag / ${s.lbs.toFixed(0)} lbs @ ${s.avgRate} — ${loc || "—"}`;
    countStockOpts.push({ value: key, label });
    countStockFillMap[key] = {
      line_count: c,
      line_bld: blend,
      line_pack: 24,
      line_rate: s.avgRate,
      line_unit: "GDN",
      line_despatch_party: loc,
    };
  }
  countStockOpts.sort((a, b) => a.label.localeCompare(b.label));
  // Party-specific rates only apply once the voucher has a saved party.
  const savedPartyCode = formVoucher?.party
    ? partyAccounts.find((p) => p.description === formVoucher.party)?.code
    : undefined;
  if (savedPartyCode) {
    const pcRows = await db
      .select()
      .from(schema.partyCounts)
      .where(eq(schema.partyCounts.partyCode, savedPartyCode));
    for (const r of pcRows) {
      if (r.ratePerLbs == null) continue;
      const k = String(r.countCode);
      countDefaultMap[k] = { ...(countDefaultMap[k] ?? { line_pack: 24 }), line_rate: r.ratePerLbs };
    }
  }

  const savedContract = formVoucher?.cont
    ? salContracts.find((c) => c.contNo === formVoucher.cont)
    : undefined;
  const savedPur = savedContract ? salBagsByCont[savedContract.contNo] ?? 0 : null;
  const savedBal = savedContract ? (savedContract.qtyBags ?? 0) - (savedPur ?? 0) : null;

  const voucherCounts = [...new Set(lines.map((l) => l.count).filter((c): c is string => !!c))];

  let stockBagCalc: number | null = null;
  let stockConCalc: number | null = null;
  let stockLbsCalc: number | null = null;
  if (voucherCounts.length) {
    const purStock = await db
      .select({
        bag: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag}), 0)`,
        con: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.con}), 0)`,
        lbs: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs}), 0)`,
      })
      .from(schema.extYarnPurVoucherLine)
      .where(inArray(schema.extYarnPurVoucherLine.count, voucherCounts));
    const salStock = await db
      .select({
        bag: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.bag}), 0)`,
        con: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.cons}), 0)`,
        lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}), 0)`,
      })
      .from(schema.extYarnSalVoucherLine)
      .where(inArray(schema.extYarnSalVoucherLine.count, voucherCounts));
    stockBagCalc = round2((purStock[0]?.bag ?? 0) - (salStock[0]?.bag ?? 0));
    stockConCalc = round2((purStock[0]?.con ?? 0) - (salStock[0]?.con ?? 0));
    stockLbsCalc = round2((purStock[0]?.lbs ?? 0) - (salStock[0]?.lbs ?? 0));
  }

  let ratePvCalc: number | null = null;
  let amtPvCalc: number | null = null;
  let plCalc: number | null = null;
  if (formVoucher && voucherCounts.length) {
    const pv = await db
      .select({
        wsum: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag} * ${schema.extYarnPurVoucherLine.rate}), 0)`,
        bsum: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag}), 0)`,
      })
      .from(schema.extYarnPurVoucherLine)
      .where(inArray(schema.extYarnPurVoucherLine.count, voucherCounts));
    const { wsum, bsum } = pv[0] ?? { wsum: 0, bsum: 0 };
    if (bsum > 0) {
      ratePvCalc = round2(wsum / bsum);
      const totalLbs = lines.reduce((a, l) => a + (l.lbs ?? 0), 0);
      amtPvCalc = round2(totalLbs * ratePvCalc);
      const saleAmt = lines.reduce((a, l) => a + (l.lbs ?? 0) * (l.rate ?? 0), 0);
      plCalc = round2(saleAmt - amtPvCalc);
    }
  }

  const nextVNoVal = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extYarnSalVoucher.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.extYarnSalVoucher);
  const upcomingVNo = "YSV-" + String((nextVNoVal[0]?.m ?? 0) + 1).padStart(4, "0");
  const lastVNoNum = nextVNoVal[0]?.m ?? 0;

  async function saveVoucher(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const vDate = ((formData.get("v_date") as string) || "").trim() || today();
    const loomType = txt(formData.get("loom_type"));
    const party = txt(formData.get("party"));
    const broker = txt(formData.get("broker"));
    const type = txt(formData.get("type")) ?? "SAL";
    const term = txt(formData.get("term")) ?? "CASH";
    const dueDate = term === "DUE" ? txt(formData.get("due_date")) : null;
    const posting = txt(formData.get("posting")) ?? "N";
    const img = txt(formData.get("img"));
    const cont = txt(formData.get("cont"));
    const pur = num(formData.get("pur"));
    const bal = num(formData.get("bal"));
    const stockBag = num(formData.get("stock_bag"));
    const stockCon = num(formData.get("stock_con"));
    const stockLbs = num(formData.get("stock_lbs"));
    const ratePv = num(formData.get("rate_pv"));
    const amtPv = num(formData.get("amt_pv"));
    const pl = num(formData.get("pl"));
    const avgRate = num(formData.get("avg_rate"));
    const remarks = txt(formData.get("remarks"));
    const pendingFinance = txt(formData.get("pending_finance"));

    const contNos = formData.getAll("line_cont_no") as string[];
    const counts = formData.getAll("line_count") as string[];
    const blds = formData.getAll("line_bld") as string[];
    const packs = formData.getAll("line_pack") as string[];
    const brands = formData.getAll("line_brand") as string[];
    const doNos = formData.getAll("line_do_no") as string[];
    const qtys = formData.getAll("line_qty") as string[];
    const bags = formData.getAll("line_bag") as string[];
    const conss = formData.getAll("line_cons") as string[];
    const lbss = formData.getAll("line_lbs") as string[];
    const units = formData.getAll("line_unit") as string[];
    const dspParties = formData.getAll("line_despatch_party") as string[];
    const rates = formData.getAll("line_rate") as string[];
    const amts = formData.getAll("line_amt") as string[];
    const rmks = formData.getAll("line_remarks") as string[];

    const validLines: {
      contNo: string | null;
      count: string | null;
      bld: string | null;
      pack: string | null;
      brand: string | null;
      doNo: string | null;
      qty: number | null;
      bag: number | null;
      cons: number | null;
      lbs: number | null;
      unit: string | null;
      despatchParty: string | null;
      rate: number | null;
      amt: number | null;
      remarks: string | null;
    }[] = [];

    const rowCount = Math.max(
      contNos.length, counts.length, blds.length, packs.length, brands.length,
      doNos.length, qtys.length, bags.length, conss.length, lbss.length,
      units.length, dspParties.length, rates.length, amts.length, rmks.length
    );

    for (let i = 0; i < rowCount; i++) {
      const c = (contNos[i] || "").trim();
      const ct = (counts[i] || "").trim();
      const bl = (blds[i] || "").trim();
      const pk = (packs[i] || "").trim();
      const br = (brands[i] || "").trim();
      const dn = (doNos[i] || "").trim();
      const q = num(qtys[i]);
      const b = num(bags[i]);
      const co = num(conss[i]);
      const l = num(lbss[i]);
      const u = (units[i] || "").trim();
      const dp = (dspParties[i] || "").trim();
      const rt = num(rates[i]);
      const am = num(amts[i]);
      const rm = (rmks[i] || "").trim();

      if (!c && !ct && !bl && !pk && !br && !dn && q == null && b == null && co == null && l == null && !u && !dp && rt == null && am == null && !rm) {
        continue;
      }

      validLines.push({
        contNo: c || null,
        count: ct || null,
        bld: bl || null,
        pack: pk || null,
        brand: br || null,
        doNo: dn || null,
        qty: q,
        bag: b,
        cons: co,
        lbs: l,
        unit: u || null,
        despatchParty: dp || null,
        rate: rt,
        amt: am,
        remarks: rm || null,
      });
    }

    if (!validLines.some((l) => (l.bag ?? 0) > 0 || (l.lbs ?? 0) > 0)) {
      redirect(
        Number.isFinite(id) && id > 0
          ? `/external/yarn/sale?id=${id}&error=no_lines`
          : `/external/yarn/sale?error=no_lines`
      );
    }

    const nowIso = new Date().toISOString();

    if (Number.isFinite(id) && id > 0) {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.extYarnSalVoucher)
          .set({
            vDate, type, loomType, party, broker, term, dueDate, posting, img, cont, pur, bal,
            stockBag, stockCon, stockLbs, ratePv, amtPv, pl, avgRate, remarks, pendingFinance,
            modifiedDate: nowIso,
          })
          .where(eq(schema.extYarnSalVoucher.id, id));

        await tx
          .delete(schema.extYarnSalVoucherLine)
          .where(eq(schema.extYarnSalVoucherLine.voucherId, id));

        if (validLines.length) {
          await tx
            .insert(schema.extYarnSalVoucherLine)
            .values(validLines.map((l) => ({ ...l, voucherId: id })));
        }
      });

      revalidatePath("/external/yarn/sale");
      redirect(`/external/yarn/sale?id=${id}`);
    } else {
      const providedVNo = ((formData.get("v_no") as string) || "").trim();

      let newId = 0;
      let codeExists = false;
      try {
        newId = await db.transaction(async (tx) => {
          const existingRows = await tx.select({ vNo: schema.extYarnSalVoucher.vNo }).from(schema.extYarnSalVoucher);
          const vNo = providedVNo || nextVNo(existingRows, "YSV");
          const nextL = existingRows.length + 1;

          const inserted = await tx
            .insert(schema.extYarnSalVoucher)
            .values({
              vNo, lvNo: nextL, vDate, type, posting, loomType, party, broker, term, dueDate, img,
              cont, pur, bal, stockBag, stockCon, stockLbs, ratePv, amtPv, pl, avgRate,
              remarks, pendingFinance, postedDate: nowIso,
            })
            .returning({ id: schema.extYarnSalVoucher.id });
          const insertedId = inserted[0].id;

          if (validLines.length) {
            await tx
              .insert(schema.extYarnSalVoucherLine)
              .values(validLines.map((l) => ({ ...l, voucherId: insertedId })));
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
        redirect(`/external/yarn/sale?error=code_exists`);
      }

      revalidatePath("/external/yarn/sale");
      redirect(`/external/yarn/sale?id=${newId}`);
    }
  }

  async function deleteVoucher(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.extYarnSalVoucherLine).where(eq(schema.extYarnSalVoucherLine.voucherId, id));
      await tx.delete(schema.extYarnSalVoucher).where(eq(schema.extYarnSalVoucher.id, id));
    });
    revalidatePath("/external/yarn/sale");
    redirect("/external/yarn/sale");
  }

  async function setOk(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db
      .update(schema.extYarnSalVoucher)
      .set({ statusOk: "OK" })
      .where(eq(schema.extYarnSalVoucher.id, id));
    revalidatePath("/external/yarn/sale");
    redirect(`/external/yarn/sale?id=${id}`);
  }

  async function clearOk(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db
      .update(schema.extYarnSalVoucher)
      .set({ statusOk: null })
      .where(eq(schema.extYarnSalVoucher.id, id));
    revalidatePath("/external/yarn/sale");
    redirect(`/external/yarn/sale?id=${id}`);
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
    <Shell active="ext-ys-vch">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">YARN SALE</h1>
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
              { key: "loomType", label: "Loom Type" },
              { key: "term", label: "Term" },
              { key: "cont", label: "Cont" },
              { key: "pur", label: "Pur" },
              { key: "bal", label: "Bal" },
            ]}
            filename="yarn-sale-vouchers"
            sheetName="YarnSale"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-6">
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

        <datalist id="ysv-parties">
          {partyAccounts.map((p) => (
            <option key={p.code} value={p.description}>
              {p.code}
            </option>
          ))}
        </datalist>
        <datalist id="ysv-contracts">
          {salContracts.map((c) => (
            <option key={c.contNo} value={c.contNo} />
          ))}
        </datalist>
        <datalist id="ysv-stock-list">
          {countStockOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </datalist>
        <datalist id="ysv-count-list">
          {countList.map((c) => (
            <option key={c.code} value={String(c.code)}>
              {c.type ?? ""}
            </option>
          ))}
        </datalist>

        <form
          id="ysv-find-form"
          method="GET"
          action="/external/yarn/sale"
          className="hidden"
        ></form>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          <div className="lg:col-span-3">
            <div className="border border-black p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding
                    ? "New — YARN SALE"
                    : formVoucher
                    ? `Edit — ${formVoucher.vNo}`
                    : "YARN SALE"}
                </div>
                <div className="flex gap-2 no-print flex-wrap">
                  <a href="/external/yarn/sale?adding=1" className="btn btn-outline btn-sm">
                    New
                  </a>
                  <button type="submit" form="ysv-save-form" className="btn btn-sm">
                    Save
                  </button>
                  <PrintButton label="Print" />
                  {formVoucher && (
                    <form action={deleteVoucher} className="inline">
                      <input type="hidden" name="id" value={formVoucher.id} />
                      <button type="submit" className="btn btn-outline btn-sm">
                        Del
                      </button>
                    </form>
                  )}
                  <a href="/external/yarn/sale" className="btn btn-outline btn-sm">
                    Exit
                  </a>
                </div>
              </div>

              <form id="ysv-save-form" action={saveVoucher}>
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
                      defaultValue={formVoucher?.type ?? "SAL"}
                    >
                      <option value="SAL">SAL</option>
                      <option value="RTN">RTN</option>
                      <option value="CON">CON</option>
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
                        form="ysv-find-form"
                        name="find"
                        className="input-box mono flex-1"
                        defaultValue={params.find ?? ""}
                        placeholder="v.no / party / cont"
                      />
                      <button form="ysv-find-form" type="submit" className="btn btn-outline btn-sm">
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

                  <div className="lg:col-span-7">
                    <label className="label block mb-1">Party</label>
                    <Combobox
                      name="party"
                      options={partyOpts}
                      defaultValue={formVoucher?.party ?? ""}
                      placeholder="Select party…"
                    />
                  </div>
                  <div className="lg:col-span-5">
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
                      inputs={["pur", "bal", "ci_rate", "ci_age", "ci_days", "ci_qty", "ci_date", "ci_remarks"]}
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
                    <label className="label block mb-1">Stock Bag</label>
                    <input
                      name="stock_bag"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={stockBagCalc ?? formVoucher?.stockBag ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Stock Con</label>
                    <input
                      name="stock_con"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={stockConCalc ?? formVoucher?.stockCon ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Stock Lbs</label>
                    <input
                      name="stock_lbs"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={stockLbsCalc ?? formVoucher?.stockLbs ?? ""}
                      readOnly
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Rate Pv</label>
                    <input
                      name="rate_pv"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={ratePvCalc ?? formVoucher?.ratePv ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Amt Pv</label>
                    <input
                      name="amt_pv"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={amtPvCalc ?? formVoucher?.amtPv ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">P/L</label>
                    <input
                      name="pl"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={plCalc ?? formVoucher?.pl ?? ""}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Avg Rate</label>
                    <input
                      name="avg_rate"
                      type="number"
                      step="any"
                      className="input-box mono bg-gray-100"
                      defaultValue={formVoucher?.avgRate ?? ""}
                      readOnly
                    />
                  </div>

                  <div className="lg:col-span-12">
                    <label className="label block mb-1">Remarks</label>
                    <input
                      name="remarks"
                      className="input-box"
                      defaultValue={formVoucher?.remarks ?? ""}
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
                  <RowAutoFill watch="line_stock_key" map={countStockFillMap} />
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
                          <th title="Pick a purchased count in stock — auto-fills the row">Stock</th>
                          <th>Count</th>
                          <th>Bld</th>
                          <th>Pack</th>
                          <th>Brand</th>
                          <th>DO.No</th>
                          <th>Qty</th>
                          <th>Bag</th>
                          <th>Cons</th>
                          <th>Lbs</th>
                          <th>Unit</th>
                          <th>Despatch Party</th>
                          <th>Rate</th>
                          <th>Amt</th>
                          <th>Remarks</th>
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
                                list="ysv-contracts"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.contNo ?? ""}
                              />
                            </td>
                            <td style={{ minWidth: "180px" }}>
                              <input
                                name="line_stock_key"
                                list="ysv-stock-list"
                                className="input-box mono text-[11px]"
                                placeholder="pick from stock…"
                                defaultValue=""
                              />
                            </td>
                            <td>
                              <input
                                name="line_count"
                                list="ysv-count-list"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.count ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_bld"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.bld ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_pack"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.pack ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_brand"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.brand ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_do_no"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.doNo ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_qty"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.qty ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_bag"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.bag ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_cons"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.cons ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_lbs"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.lbs ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_unit"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.unit ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_despatch_party"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.despatchParty ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_rate"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.rate ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_amt"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.amt ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="line_remarks"
                                className="input-box mono text-[12px]"
                                defaultValue={row?.remarks ?? ""}
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
                  <a href="/external/yarn/sale?adding=1" className="btn btn-outline btn-sm">
                    New
                  </a>
                  <button type="submit" className="btn btn-sm">
                    Save
                  </button>
                  <PrintButton label="Print" />
                  <a href="/external/yarn/sale" className="btn btn-outline btn-sm">
                    Exit
                  </a>
                  {formVoucher && (
                    <button
                      type="submit"
                      formAction={deleteVoucher}
                      className="btn btn-outline btn-sm"
                    >
                      Del
                    </button>
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
                  <button type="submit" className="btn btn-outline btn-sm">
                    Delete
                  </button>
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
                      const href = `/external/yarn/sale?id=${v.id}`;
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
                              {formatNum(v.avgRate)}
                            </a>
                          </td>
                          <td className="text-right mono text-[11px]">
                            <a href={href} className="no-underline block" style={linkStyle}>
                              {formatNum(v.amtPv)}
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
                  <th>Loom Type</th>
                  <th>Term</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const isSel = v.id === selected?.id;
                  const href = `/external/yarn/sale?id=${v.id}`;
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
                    <td colSpan={6} className="text-center text-[13px] text-[var(--muted)] py-6">
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
