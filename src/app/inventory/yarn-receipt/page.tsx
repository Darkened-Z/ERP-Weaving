import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { RowClearButton } from "@/components/row-clear-button";
import { Combobox } from "@/components/combobox";
import { FindingPicker } from "@/components/finding-picker";
import { AutoFill, RowCalc } from "@/components/auto-fill";
import { PartyCountRate } from "@/components/party-count-rate";
import { AutoAmount } from "@/components/auto-amount";
import { YarnReceiptCounts } from "@/components/yarn-receipt-counts";
import { WVG_CONVERSION_PREFIX } from "@/lib/coa-heads";
import { loadConvContracts } from "@/lib/conv-contracts";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today, nowTime } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num, intVal, txt, escLike, round } from "@/lib/form";
import { yarnStockGodownDesc, godownLocationOpts, partyCountRateMap } from "@/lib/godowns";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  code_exists: "Voucher number already exists. Try again.",
  qty_required: "Enter Bags or Qty (Lbs) greater than zero.",
  purcont_required: "Pur.Cont No is required.",
  lbs_mismatch: "Header Qty Lbs does not match the carton total. Clear it to auto-fill, or fix the cartons.",
  period_locked: "Period is locked. Cannot save for this date.",
  admin_only: "Only ADMIN can delete vouchers.",
};

export default async function YarnReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";

  const findFilter = params.find?.trim();
  const escFind = findFilter != null ? escLike(findFilter) : undefined;
  const pat = escFind ? `%${escFind}%` : "";

  const list = findFilter
    ? await db
        .select()
        .from(schema.intYarnReceipt)
        .where(sql`
          ${schema.intYarnReceipt.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnReceipt.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnReceipt.yarnPartyTo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnReceipt.countCode} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intYarnReceipt.id))
    : await db.select().from(schema.intYarnReceipt).orderBy(desc(schema.intYarnReceipt.id));

  const selected = isEditing ? list.find((r) => r.id === idParam) ?? null : null;
  const editing = isAdding ? null : selected;

  const lines = editing
    ? await db
        .select()
        .from(schema.intYarnReceiptLine)
        .where(eq(schema.intYarnReceiptLine.receiptId, editing.id))
        .orderBy(schema.intYarnReceiptLine.srNo)
    : [];

  const maxRow = await db
    .select({
      maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intYarnReceipt.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.intYarnReceipt)
    .where(sql`${schema.intYarnReceipt.vNo} LIKE 'IYR-%'`);
  const nextNum = (maxRow[0]?.maxNum ?? 0) + 1;
  const upcomingVNo = `IYR-${String(nextNum).padStart(4, "0")}`;

  const lastLvRow = await db
    .select({ maxLv: sql<number>`COALESCE(MAX(${schema.intYarnReceipt.lvNo}), 0)` })
    .from(schema.intYarnReceipt);
  const lastLvNo = lastLvRow[0]?.maxLv ?? 0;

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);

  const countList = await db
    .select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.countCode);

  // Purchase-contract picker + rate fallback — from BOTH internal and external
  // yarn purchase contracts (the mill's live ones are external), else the picker
  // (Pur.Cont No is required to save) is empty.
  const purSel = <T extends typeof schema.intYarnPurchaseContract | typeof schema.extYarnPurContract>(t: T) => ({
    contNo: t.contNo, countCode: t.countCode, ratio: t.ratio, qtyLbs: t.qtyLbs,
    ratePerLbs: t.ratePerLbs, contDate: t.contDate, status: t.status, brand: t.brand,
    remarks: t.remarks, partyCode: t.partyCode,
  });
  const [intPur, extPur] = await Promise.all([
    db.select(purSel(schema.intYarnPurchaseContract)).from(schema.intYarnPurchaseContract).where(eq(schema.intYarnPurchaseContract.status, "R")),
    db.select(purSel(schema.extYarnPurContract)).from(schema.extYarnPurContract).where(eq(schema.extYarnPurContract.status, "R")),
  ]);
  const purContracts = [...intPur, ...extPur];

  // Conversion-contract picker (fills yarn party-to) — BOTH int + ext.
  const convContracts = await loadConvContracts();

  const constructions = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction);
  const qualityByCode: Record<string, string> = Object.fromEntries(
    constructions.map((c) => [c.code, c.description])
  );

  const priorLotsRows = await db
    .selectDistinct({ v: schema.intYarnReceipt.yarnLotNo })
    .from(schema.intYarnReceipt)
    .where(sql`${schema.intYarnReceipt.yarnLotNo} IS NOT NULL AND ${schema.intYarnReceipt.yarnLotNo} <> ''`);
  const priorLots = priorLotsRows.map((r) => r.v).filter((v): v is string => !!v);

  const priorLocFromRows = await db
    .selectDistinct({ v: schema.intYarnReceipt.locationFrom })
    .from(schema.intYarnReceipt)
    .where(sql`${schema.intYarnReceipt.locationFrom} IS NOT NULL AND ${schema.intYarnReceipt.locationFrom} <> ''`);
  const locOpts = priorLocFromRows
    .map((r) => r.v)
    .filter((v): v is string => !!v)
    .sort()
    .map((v) => ({ value: v, label: v }));

  const brandRows = await db
    .select({ name: schema.yarnBrands.name })
    .from(schema.yarnBrands)
    .orderBy(schema.yarnBrands.name);
  const blendRows = await db
    .select({ description: schema.yarnBlends.description })
    .from(schema.yarnBlends)
    .orderBy(schema.yarnBlends.description);

  const partyDescByCode: Record<string, string> = {};
  for (const p of parties) partyDescByCode[p.code] = p.description;
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));

  // Delivered-FROM party: DEBTORS-CONVERSION (WVG) head 1.01.01.01 only.
  const convPartyOpts = parties
    .filter((p) => String(p.code).startsWith(WVG_CONVERSION_PREFIX))
    .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));

  // Delivered-TO is a GODOWN account only (1.01.25.01); defaults to the yarn-stock
  // godown (helper resolves it by CODE), field stays changeable.
  const yarnGodownDesc = yarnStockGodownDesc(parties);
  const godownOpts = godownLocationOpts(parties);
  const countOpts = countList.map((c) => ({ value: c.code, label: `${c.code} — ${c.description}${c.type ? ' ' + c.type : ''}` }));
  const countDescByCode = new Map(countList.map((c) => [c.code, c.description]));
  const fmtN = (n: number | null | undefined, d = 0) =>
    n == null ? "" : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-US");

  const purContractColumns = [
    { key: "cont", label: "Cont #", width: 88 },
    { key: "desc", label: "Prd. Desc" },
    { key: "qty", label: "Qty Lbs", width: 90, align: "right" as const },
    { key: "rate", label: "Rate", width: 70, align: "right" as const },
    { key: "date", label: "Date", width: 86 },
    { key: "status", label: "St", width: 34 },
  ];
  const purContractRows = purContracts.map((c) => {
    const desc = [c.countCode, c.ratio].filter(Boolean).join(" ");
    return {
      value: c.contNo,
      code: c.contNo,
      description: desc,
      cells: {
        cont: c.contNo,
        desc,
        qty: fmtN(c.qtyLbs),
        rate: fmtN(c.ratePerLbs, 2),
        date: c.contDate ?? "",
        status: c.status ?? "",
      },
    };
  });

  const convContractColumns = [
    { key: "cont", label: "Cont #", width: 88 },
    { key: "desc", label: "Prd. Desc" },
    { key: "qty", label: "Qty Mtr", width: 84, align: "right" as const },
    { key: "convRate", label: "Conv Rate", width: 78, align: "right" as const },
    { key: "grayRate", label: "Gray Rate", width: 78, align: "right" as const },
    { key: "date", label: "Date", width: 86 },
    { key: "status", label: "St", width: 34 },
  ];
  const convContractRows = convContracts.map((c) => {
    const desc =
      (c.grayQltyCode && qualityByCode[c.grayQltyCode]) ||
      (c.grayCode && qualityByCode[c.grayCode]) ||
      c.grayCode ||
      c.grayQltyCode ||
      "";
    return {
      value: c.contNo,
      code: c.contNo,
      description: desc,
      cells: {
        cont: c.contNo,
        desc,
        qty: fmtN(c.qtyMtr),
        convRate: fmtN(c.convRatePerMtr, 2),
        grayRate: fmtN(c.grayRatePerMtr, 2),
        date: c.contDate ?? "",
        status: c.status ?? "",
      },
    };
  });

  const purMap: Record<string, Record<string, string | number>> = {};
  for (const c of purContracts) {
    purMap[c.contNo] = {
      countCode: c.countCode ?? "",
      ratioText: c.ratio ?? "",
      brand: c.brand ?? "",
      // Rate comes from the PARTY'S COUNT contract (owner's rule) — fills both the
      // delivered-to rate and the count-detail rate.
      ratePerLbs: c.ratePerLbs ?? "",
      ratePerLbsTo: c.ratePerLbs ?? "",
      remarks: c.remarks ?? "",
      party: c.partyCode ? partyDescByCode[c.partyCode] ?? c.partyCode : "",
    };
  }
  const convMap: Record<string, Record<string, string | number>> = {};
  for (const c of convContracts) {
    convMap[c.contNo] = {
      yarnPartyTo: c.party ?? "",
    };
  }

  // Rate/Lbs auto on Party + Count pick: the shared party_counts rate map, with the
  // party's running purchase-contract rate as fallback for pairs it doesn't cover.
  const pcMap = await partyCountRateMap(parties);
  for (const c of purContracts) {
    if (!c.partyCode || !c.countCode || c.ratePerLbs == null) continue;
    const key = `${partyDescByCode[c.partyCode] ?? c.partyCode}||${c.countCode}`;
    if (!(key in pcMap)) pcMap[key] = c.ratePerLbs;
  }

  // Server-computed stock for the selected voucher's (count, party, location).
  let stockBag: number | null = null;
  let stockLbs: number | null = null;
  if (editing && editing.countCode && editing.party) {
    const whereClauses = [
      eq(schema.intYarnReceipt.countCode, editing.countCode),
      eq(schema.intYarnReceipt.party, editing.party),
      ne(schema.intYarnReceipt.id, editing.id),
    ];
    if (editing.locationFrom) {
      whereClauses.push(eq(schema.intYarnReceipt.locationFrom, editing.locationFrom));
    }
    const agg = await db
      .select({
        bags: sql<number>`COALESCE(SUM(${schema.intYarnReceipt.bags}), 0)`,
        lbs: sql<number>`COALESCE(SUM(${schema.intYarnReceipt.qtyLbs}), 0)`,
      })
      .from(schema.intYarnReceipt)
      .where(and(...whereClauses));
    stockBag = agg[0]?.bags ?? 0;
    stockLbs = agg[0]?.lbs ?? 0;
  }

  // Existing godown stock of each count BEFORE this voucher (net of RCPT − RETN in the
  // yarn-stock godown, excluding the current voucher). Shown when a count is picked.
  const godownStockRows = yarnGodownDesc
    ? await db
        .select({
          countCode: schema.intYarnReceipt.countCode,
          bags: sql<number>`COALESCE(SUM(CASE WHEN ${schema.intYarnReceipt.trnType} = 'RETN' THEN -${schema.intYarnReceipt.bags} ELSE ${schema.intYarnReceipt.bags} END), 0)`,
          lbs: sql<number>`COALESCE(SUM(CASE WHEN ${schema.intYarnReceipt.trnType} = 'RETN' THEN -${schema.intYarnReceipt.qtyLbs} ELSE ${schema.intYarnReceipt.qtyLbs} END), 0)`,
        })
        .from(schema.intYarnReceipt)
        .where(and(
          eq(schema.intYarnReceipt.yarnPartyTo, yarnGodownDesc),
          ...(editing ? [ne(schema.intYarnReceipt.id, editing.id)] : []),
        ))
        .groupBy(schema.intYarnReceipt.countCode)
    : [];
  const countStockMap: Record<string, Record<string, number>> = {};
  for (const r of godownStockRows) {
    if (!r.countCode) continue;
    countStockMap[r.countCode] = {
      stock_bage_disp: Math.round((r.bags ?? 0) * 100) / 100,
      stock_lbs_disp: Math.round((r.lbs ?? 0) * 100) / 100,
    };
  }

  async function saveAction(formData: FormData) {
    "use server";
    try {
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const isUpdate = Number.isFinite(id) && id > 0;
    const backQ = isUpdate ? `?id=${id}` : `?adding=1`;

    const vDate = txt(formData.get("vDate")) ?? today();
    await assertPeriodOpen(vDate, "INVENTORY");
    const purContNo = txt(formData.get("purContNo"));
    if (!purContNo) {
      redirect(`/inventory/yarn-receipt${backQ}&error=purcont_required`);
    }

    // Total Bags is a read-only client total — recompute server-side from Warp+Weft
    // bags so a stale/tampered value can't skew the stock aggregate.
    const warpBagsN = num(formData.get("warp"));
    const weftBagsN = num(formData.get("weft"));
    const bags =
      warpBagsN != null || weftBagsN != null
        ? (warpBagsN ?? 0) + (weftBagsN ?? 0)
        : num(formData.get("bags"));
    let qtyLbs = num(formData.get("qtyLbs"));

    const cartonNos = formData.getAll("cartonNo") as string[];
    const grossKgsArr = formData.getAll("grossKgs") as string[];
    const netKgsArr = formData.getAll("netKgs") as string[];
    const netLbsArr = formData.getAll("netLbs") as string[];

    const validLines: {
      srNo: number;
      cartonNo: string | null;
      grossKgs: number | null;
      netKgs: number | null;
      netLbs: number | null;
    }[] = [];
    for (let i = 0; i < cartonNos.length; i++) {
      const cn = (cartonNos[i] || "").trim();
      const gk = num(grossKgsArr[i]);
      const nk = num(netKgsArr[i]);
      let nl = num(netLbsArr[i]);
      if (!cn && gk == null && nk == null && nl == null) continue;
      if (nl == null && nk != null) nl = round(nk * 2.2046, 3);
      validLines.push({
        srNo: validLines.length + 1,
        cartonNo: cn || null,
        grossKgs: gk,
        netKgs: nk,
        netLbs: nl,
      });
    }

    const cartonLbsSum = validLines.reduce((s, l) => s + (l.netLbs ?? 0), 0);
    const hasCartons = validLines.some((l) => (l.netLbs ?? 0) > 0);
    if (hasCartons) {
      const rounded = round(cartonLbsSum, 3);
      if (qtyLbs != null && Math.abs(qtyLbs - rounded) > 0.01) {
        redirect(`/inventory/yarn-receipt${backQ}&error=lbs_mismatch`);
      }
      qtyLbs = rounded;
    } else if (qtyLbs == null && bags != null && bags > 0) {
      qtyLbs = round(bags * 100, 2);
    }

    if (!((bags ?? 0) > 0 || (qtyLbs ?? 0) > 0)) {
      redirect(`/inventory/yarn-receipt${backQ}&error=qty_required`);
    }

    const ratePerLbs = num(formData.get("ratePerLbs"));
    // Always recompute amount server-side; ignore any client-submitted value.
    const amount = ratePerLbs != null ? round((qtyLbs ?? 0) * ratePerLbs, 2) : null;

    const header = {
      vDate,
      time: txt(formData.get("time")),
      bookDoBiltyNo: txt(formData.get("bookDoBiltyNo")),
      doDate: txt(formData.get("doDate")) ?? vDate,
      lgpNo: txt(formData.get("lgpNo")),
      gpDate: txt(formData.get("gpDate")) ?? vDate,
      party: txt(formData.get("party")),
      trnType: txt(formData.get("trnType")),
      condition: txt(formData.get("condition")) ?? "FRS",
      lvNo: intVal(formData.get("lvNo")),
      convContNo: txt(formData.get("convContNo")),
      purContNo,
      yarnPartyTo: txt(formData.get("yarnPartyTo")),
      timeTo: txt(formData.get("timeTo")),
      ratePerLbsTo: num(formData.get("ratePerLbsTo")),
      amount,
      locationFrom: txt(formData.get("locationFrom")),
      imgBlock: txt(formData.get("imgBlock")),
      // stockBag / stockLbs are display-only, computed on read
      stockBag: null,
      stockLbs: null,
      countCode: txt(formData.get("countCode")),
      warp: txt(formData.get("warp")),
      weft: txt(formData.get("weft")),
      bags,
      qtyLbs,
      ratePerLbs,
      brand: txt(formData.get("brand")),
      yarnLotNo: txt(formData.get("yarnLotNo")),
      setNo: txt(formData.get("setNo")),
      ratioText: txt(formData.get("ratioText")),
      remarks: txt(formData.get("remarks")),
    };

    const nowIso = new Date().toISOString();

    try {
      if (isUpdate) {
        await db.transaction(async (tx) => {
          await tx
            .update(schema.intYarnReceipt)
            .set({ ...header, modifiedDate: nowIso })
            .where(eq(schema.intYarnReceipt.id, id));
          await tx
            .delete(schema.intYarnReceiptLine)
            .where(eq(schema.intYarnReceiptLine.receiptId, id));
          if (validLines.length) {
            await tx
              .insert(schema.intYarnReceiptLine)
              .values(validLines.map((l) => ({ ...l, receiptId: id })));
          }
        });
        revalidatePath("/inventory/yarn-receipt");
        redirect(`/inventory/yarn-receipt?id=${id}`);
      } else {
        const providedVNo = ((formData.get("vNo") as string) || "").trim();
        const newId = await db.transaction(async (tx) => {
          let vNo = providedVNo;
          if (!vNo) {
            const maxRes = await tx
              .select({
                maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intYarnReceipt.vNo}, 5) AS INTEGER)), 0)`,
              })
              .from(schema.intYarnReceipt)
              .where(sql`${schema.intYarnReceipt.vNo} LIKE 'IYR-%'`);
            const n = (maxRes[0]?.maxNum ?? 0) + 1;
            vNo = `IYR-${String(n).padStart(4, "0")}`;
          }
          const lvRow = await tx
            .select({ maxLv: sql<number>`COALESCE(MAX(${schema.intYarnReceipt.lvNo}), 0)` })
            .from(schema.intYarnReceipt);
          const nextLv = (lvRow[0]?.maxLv ?? 0) + 1;
          const inserted = await tx
            .insert(schema.intYarnReceipt)
            .values({ ...header, lvNo: header.lvNo ?? nextLv, vNo, postedDate: nowIso })
            .returning({ id: schema.intYarnReceipt.id });
          const insertedId = inserted[0].id;
          if (validLines.length) {
            await tx
              .insert(schema.intYarnReceiptLine)
              .values(validLines.map((l) => ({ ...l, receiptId: insertedId })));
          }
          return insertedId;
        });
        revalidatePath("/inventory/yarn-receipt");
        redirect(`/inventory/yarn-receipt?id=${newId}`);
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "unknown";
      if (/UNIQUE|constraint/i.test(msg)) {
        redirect(`/inventory/yarn-receipt${backQ}&error=code_exists`);
      }
      throw e;
    }
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
      const thru = parseLockedThroughFromError(err.message ?? "");
      if (thru) redirect(`/inventory/yarn-receipt?error=period_locked&thru=${thru}`);
      throw e;
    }
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const session = await getSession();
    if (session?.roleName !== "ADMIN") redirect("/inventory/yarn-receipt?error=admin_only");
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.intYarnReceiptLine).where(eq(schema.intYarnReceiptLine.receiptId, id));
      await tx.delete(schema.intYarnReceipt).where(eq(schema.intYarnReceipt.id, id));
    });
    revalidatePath("/inventory/yarn-receipt");
    redirect(`/inventory/yarn-receipt`);
  }

  const ROWS = Math.max(3, lines.length + 3);
  const showForm = !!editing || isAdding;
  const lvDisplay = editing?.lvNo ?? lastLvNo ?? "";
  const doDateDefault = editing?.doDate ?? (isAdding ? today() : "");
  const gpDateDefault = editing?.gpDate ?? (isAdding ? today() : "");
  const displayedStockBag = stockBag ?? editing?.stockBag ?? "";
  const displayedStockLbs = stockLbs ?? editing?.stockLbs ?? "";

  return (
    <Shell active="yarn-receipt">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">YARN RECEIPT/RETURN ( WVG )</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {list.length} voucher{list.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={list.map((r) => ({
              vNo: r.vNo,
              vDate: r.vDate,
              trnType: r.trnType,
              condition: r.condition,
              party: r.party,
              yarnPartyTo: r.yarnPartyTo,
              countCode: r.countCode,
              bags: r.bags,
              qtyLbs: r.qtyLbs,
              ratePerLbs: r.ratePerLbs,
              amount: r.amount,
              purContNo: r.purContNo,
              convContNo: r.convContNo,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "trnType", label: "Trn Type" },
              { key: "condition", label: "Condition" },
              { key: "party", label: "Party" },
              { key: "yarnPartyTo", label: "Yarn Party To" },
              { key: "countCode", label: "Count Code" },
              { key: "bags", label: "Bags" },
              { key: "qtyLbs", label: "Qty Lbs" },
              { key: "ratePerLbs", label: "Rate/Lbs" },
              { key: "amount", label: "Amount" },
              { key: "purContNo", label: "Pur Cont No" },
              { key: "convContNo", label: "Conv Cont No" },
            ]}
            filename="yarn-receipt"
            sheetName="YarnReceipt"
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

        <datalist id="iyr-lot-list">
          {priorLots.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>

        <datalist id="iyr-brands">
          {brandRows.map((b) => (
            <option key={b.name} value={b.name} />
          ))}
        </datalist>

        <datalist id="iyr-blends">
          {blendRows.map((b) => (
            <option key={b.description} value={b.description} />
          ))}
        </datalist>

        <form id="iyr-find-form" method="GET" action="/inventory/yarn-receipt" className="hidden" />

        <div className="border border-black p-4 mb-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New — YARN RECEIPT/RETURN" : editing ? `Edit — ${editing.vNo}` : "YARN RECEIPT/RETURN"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/yarn-receipt?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="iyr-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              {editing ? (
                <form action={deleteAction} className="inline">
                  <input type="hidden" name="id" value={editing.id} />
                  <ConfirmButton message="Delete this voucher and its cartons? This cannot be undone.">
                    Delete
                  </ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the voucher first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Delete
                </button>
              )}
              <a href="/inventory/yarn-receipt" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>

          {showForm && (
            <form id="iyr-save-form" action={saveAction}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <input type="hidden" name="one" defaultValue="1" readOnly />
              <AutoAmount qty="qtyLbs" rate="ratePerLbs" target="amount" />
              <RowCalc target="netLbs" a="netKgs" factor={2.2046} round={3} />
              <YarnReceiptCounts />
              <AutoFill
                watch="purContNo"
                map={purMap}
                combos={["party", "countCode"]}
                inputs={["ratioText", "brand", "remarks", "ratePerLbs", "ratePerLbsTo"]}
              />
              <AutoFill
                watch="convContNo"
                map={convMap}
                combos={["yarnPartyTo"]}
              />
              {/* Picking a count shows how much of it is already in the godown */}
              <AutoFill watch="countCode" map={countStockMap} inputs={["stock_bage_disp", "stock_lbs_disp"]} />
              {/* Party + Count picked → that party-count's Rate/Lbs fills both rate boxes */}
              <PartyCountRate
                partyField="party"
                countField="countCode"
                map={pcMap}
                targets={["ratePerLbs", "ratePerLbsTo"]}
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">DELIVERED FROM</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3 gform">
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Date</label>
                        <input name="vDate" type="date" className="input-box mono" defaultValue={editing?.vDate ?? today()} required />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">No.</label>
                        <input name="vNo" className="input-box mono bg-gray-100" defaultValue={editing?.vNo ?? upcomingVNo} readOnly />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">LV.No</label>
                        <input name="lvNo" type="number" step="1" className="input-box mono bg-gray-100" defaultValue={lvDisplay} readOnly />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input name="time" className="input-box mono" defaultValue={editing?.time ?? nowTime()} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">Book.DO/Bilty No.</label>
                        <input name="bookDoBiltyNo" className="input-box mono" defaultValue={editing?.bookDoBiltyNo ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">DO Date</label>
                        <input name="doDate" type="date" className="input-box mono" defaultValue={doDateDefault} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="label block mb-1">Posted</label>
                        <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.postedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="label block mb-1">Modified</label>
                        <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.modifiedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">LGP No.</label>
                        <input name="lgpNo" className="input-box mono" defaultValue={editing?.lgpNo ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">GP Date</label>
                        <input name="gpDate" type="date" className="input-box mono" defaultValue={gpDateDefault} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Trn. Type</label>
                        <select name="trnType" className="input-box mono" defaultValue={editing?.trnType ?? (isAdding ? "RCPT" : "")}>
                          <option value="RCPT">RCPT — Receive</option>
                          <option value="RETN">RETN — Return</option>
                          {editing?.trnType && !["RCPT", "RETN"].includes(editing.trnType) && (
                            <option value={editing.trnType}>{editing.trnType}</option>
                          )}
                        </select>
                      </div>

                      <div className="md:col-span-8">
                        <label className="label block mb-1">Party <span className="text-[9px] text-[var(--muted)]">(DEBITORS - CONVERSION WVG)</span></label>
                        <Combobox name="party" options={convPartyOpts} defaultValue={editing?.party ?? ""} placeholder="Select party" />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Condition</label>
                        <select name="condition" className="input-box mono" defaultValue={editing?.condition ?? "FRS"}>
                          <option value="FRS">FRS</option>
                          <option value="OLD">OLD</option>
                          <option value="REJ">REJ</option>
                        </select>
                      </div>

                      <div className="md:col-span-6">
                        <label className="label block mb-1">Conv.Cont No (F9)</label>
                        <FindingPicker
                          name="convContNo"
                          defaultValue={editing?.convContNo ?? ""}
                          rows={convContractRows}
                          columns={convContractColumns}
                          title="GREY CONVERSION CONTRACT LIST"
                          placeholder="Select conv contract"
                        />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Pur.Cont No (F9) *</label>
                        <FindingPicker
                          name="purContNo"
                          defaultValue={editing?.purContNo ?? ""}
                          rows={purContractRows}
                          columns={purContractColumns}
                          title="YARN PURCHASE CONTRACT LIST"
                          placeholder="Select purchase contract"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">DELIVERED TO</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3 gform">
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Yarn Party To <span className="text-[9px] text-[var(--muted)]">(godown yarn stock — changeable)</span></label>
                        <Combobox name="yarnPartyTo" options={godownOpts} defaultValue={editing?.yarnPartyTo || yarnGodownDesc} placeholder="Godown…" />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input name="timeTo" className="input-box mono" defaultValue={editing?.timeTo ?? nowTime()} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Rate / Lbs To</label>
                        <input name="ratePerLbsTo" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.ratePerLbsTo ?? ""} />
                      </div>

                      <div className="md:col-span-3">
                        <label className="label block mb-1">Amount</label>
                        <input name="amount" type="number" step="0.01" className="input-box mono text-right bg-gray-100" defaultValue={editing?.amount ?? ""} readOnly />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Location From (F9)</label>
                        <Combobox name="locationFrom" options={locOpts} defaultValue={editing?.locationFrom ?? ""} placeholder="Type or select location" />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Imag Block</label>
                        <div className="flex items-stretch gap-1">
                          <input name="imgBlock" className="input-box mono flex-1" defaultValue={editing?.imgBlock ?? ""} placeholder="filename" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">COUNT-DETAIL</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3 gform">
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Stock Bage <span className="text-[9px] text-[var(--muted)]">(count in godown)</span></label>
                        <input name="stock_bage_disp" type="number" step="0.01" className="input-box mono bg-gray-100 text-right" defaultValue={editing?.countCode ? (countStockMap[editing.countCode]?.stock_bage_disp ?? displayedStockBag) : ""} readOnly tabIndex={-1} />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Stock Lbs <span className="text-[9px] text-[var(--muted)]">(count in godown)</span></label>
                        <input name="stock_lbs_disp" type="number" step="0.01" className="input-box mono bg-gray-100 text-right" defaultValue={editing?.countCode ? (countStockMap[editing.countCode]?.stock_lbs_disp ?? displayedStockLbs) : ""} readOnly tabIndex={-1} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">Count Code (F9)</label>
                        <Combobox name="countCode" options={countOpts} defaultValue={editing?.countCode ?? ""} placeholder="Select count" />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Warp Bags</label>
                        <input name="warp" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.warp ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Weft Bags</label>
                        <input name="weft" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.weft ?? ""} />
                      </div>

                      <div className="md:col-span-3">
                        <label className="label block mb-1">Total Bags <span className="text-[9px] text-[var(--muted)]">(warp + weft)</span></label>
                        <input name="bags" type="number" step="0.01" className="input-box mono text-right bg-gray-100" defaultValue={editing?.bags ?? ""} readOnly tabIndex={-1} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Qty Lbs <span className="text-[9px] text-[var(--muted)]">(auto ×100, editable)</span></label>
                        <input name="qtyLbs" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.qtyLbs ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Rate / Lbs <span className="text-[9px] text-[var(--muted)]">(= delivered-to)</span></label>
                        <input name="ratePerLbs" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.ratePerLbs ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Brand</label>
                        <input name="brand" list="iyr-brands" className="input-box mono" defaultValue={editing?.brand ?? ""} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">Yarn Lot #</label>
                        <input name="yarnLotNo" list="iyr-lot-list" className="input-box mono" defaultValue={editing?.yarnLotNo ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Ratio</label>
                        <input name="ratioText" list="iyr-blends" className="input-box mono" defaultValue={editing?.ratioText ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Set No.</label>
                        <input name="setNo" className="input-box mono" defaultValue={editing?.setNo ?? ""} />
                      </div>

                      <div className="md:col-span-12 gform-full">
                        <label className="label block mb-1">Remarks</label>
                        <input name="remarks" className="input-box" defaultValue={editing?.remarks ?? ""} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <div className="border border-black">
                    <div className="overflow-x-auto" style={{ maxHeight: "72vh", overflowY: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: "44px" }}>Sr.#</th>
                            <th>Carton No</th>
                            <th className="text-right">Gross Kgs</th>
                            <th className="text-right">Net Kgs</th>
                            <th className="text-right">Net Lbs</th>
                            <th style={{ width: "22px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: ROWS }).map((_, i) => {
                            const l = lines[i];
                            return (
                              <tr key={i}>
                                <td className="mono text-[12px] text-center">{i + 1}</td>
                                <td><input name="cartonNo" className="input-box mono text-[12px]" defaultValue={l?.cartonNo ?? ""} /></td>
                                <td><input name="grossKgs" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={l?.grossKgs ?? ""} /></td>
                                <td><input name="netKgs" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={l?.netKgs ?? ""} /></td>
                                <td><input name="netLbs" type="number" step="0.001" className="input-box mono text-[12px] text-right bg-gray-50" defaultValue={l?.netLbs ?? ""} /></td>
                                <td className="text-center">
                                  <RowClearButton />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] p-2 border-t border-black">
                      Net Lbs = Net Kgs × 2.2046. Header Qty Lbs is the carton total.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/inventory/yarn-receipt" className="btn btn-outline btn-sm">Exit</a>
                <div className="ml-auto flex items-end gap-4">
                  <div>
                    <label className="label block mb-1">Password</label>
                    <input className="input-box mono" placeholder="password" type="password" />
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="border border-black">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Vouchers</div>
            <form className="flex gap-2" id="find-form" method="GET" action="/inventory/yarn-receipt">
              <input name="find" className="input-box mono" defaultValue={params.find ?? ""} placeholder="Find V.No / Party / Count" />
              <button className="btn btn-outline btn-sm" type="submit">Find</button>
            </form>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>Trn</th>
                  <th>Cond</th>
                  <th>Party</th>
                  <th>Yarn Party To</th>
                  <th>Count</th>
                  <th className="text-right">Bags</th>
                  <th className="text-right">Qty Lbs</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const isSel = r.id === selected?.id;
                  const href = `/inventory/yarn-receipt?id=${r.id}`;
                  const style = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={style}>{r.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.vDate}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.trnType ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.condition ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>
                        <div>{r.party ?? "-"}</div>
                        {r.party && partyCodeByDesc.get(r.party) && (
                          <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(r.party)}</div>
                        )}
                      </a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>
                        <div>{r.yarnPartyTo ?? "-"}</div>
                        {r.yarnPartyTo && partyCodeByDesc.get(r.yarnPartyTo) && (
                          <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(r.yarnPartyTo)}</div>
                        )}
                      </a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>
                        <div>{r.countCode ?? "-"}</div>
                        {r.countCode && countDescByCode.get(r.countCode) && (
                          <div className="text-[11px] text-[var(--muted)]">{countDescByCode.get(r.countCode)}</div>
                        )}
                      </a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{r.bags ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{r.qtyLbs ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{r.amount ?? "-"}</a></td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={10} className="text-center text-[13px] text-[var(--muted)] py-6">No vouchers. Click <b>New</b> above to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
