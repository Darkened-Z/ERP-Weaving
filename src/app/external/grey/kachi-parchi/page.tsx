import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowAutoFill } from "@/components/auto-fill";
import { TermSelect } from "@/components/term-select";
import { ConfirmButton } from "@/components/confirm-button";
import { KachiCalc } from "@/components/kachi-calc";
import { db, schema } from "@/db";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { today as pkToday } from "@/lib/time";
import { assertPeriodOpen } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

const today = () => pkToday();

const TYPE_OPTIONS = ["STOCK", "SALE", "TRANSFER"];
const LINE_ROWS = 4;
const COUNT_ROWS = 4;

export default async function KachiParchiPage({
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

  const parchis = findFilter
    ? await db
        .select()
        .from(schema.extKachiParchi)
        .where(sql`
          ${schema.extKachiParchi.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extKachiParchi.kpNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extKachiParchi.purchaseParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extKachiParchi.saleParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extKachiParchi.dspQuality} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.extKachiParchi.id))
    : await db
        .select()
        .from(schema.extKachiParchi)
        .orderBy(desc(schema.extKachiParchi.id));

  const selected = isEditing ? parchis.find((p) => p.id === idParam) ?? null : null;
  const formItem = isAdding ? null : selected;

  const lines = formItem
    ? await db
        .select()
        .from(schema.extKachiParchiLine)
        .where(eq(schema.extKachiParchiLine.parchiId, formItem.id))
        .orderBy(schema.extKachiParchiLine.srNo)
    : [];

  const counts = formItem
    ? await db
        .select()
        .from(schema.extKachiParchiCount)
        .where(eq(schema.extKachiParchiCount.parchiId, formItem.id))
        .orderBy(schema.extKachiParchiCount.id)
    : [];

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);

  const yarnCountList = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .where(eq(schema.yarnCounts.status, "A"))
    .orderBy(schema.yarnCounts.countCode);
  const kpCountFillMap: Record<string, Record<string, string>> = {};
  for (const c of yarnCountList) {
    kpCountFillMap[String(c.countCode)] = { count_desc: c.description ?? "", count_type: c.type ?? "" };
  }
  const kpCountDescByCode = new Map(yarnCountList.map((c) => [String(c.countCode), c.description ?? ""]));

  const partyAccounts = parties.filter((p) => p.level >= 5);
  const partyOpts = partyAccounts.map((p) => ({
    value: p.description,
    label: `${p.code} — ${p.description}`,
    desc: p.code,
  }));
  // Purchase Party auto = the grey-stock godown (level-5 under the "STOCK - GREY" head,
  // code 1.01.25.15 → "Godown - Grey Stock Treading"). We pick up (uthana) grey lying in
  // this godown; stock/avg below aggregate what was purchased into it.
  const greyStockHead = parties.find((p) => p.level === 4 && /stock\s*-\s*grey/i.test(p.description));
  const godownParty =
    (greyStockHead ? partyAccounts.find((p) => p.code.startsWith(greyStockHead.code + "."))?.description : undefined) ??
    partyAccounts.find((p) => /godown/i.test(p.description) && /grey\s*stock/i.test(p.description))?.description ??
    partyAccounts.find((p) => p.description.toUpperCase().includes("GODOWN"))?.description ??
    "";
  // Printing Name lists ONLY printing parties (the "CREDITORS - PRINTING" group).
  const printingHead =
    parties.find((p) => p.level === 3 && /printing/i.test(p.description)) ??
    parties.find((p) => p.level < 5 && /printing/i.test(p.description));
  const printingOpts = printingHead
    ? partyAccounts
        .filter((p) => p.code.startsWith(printingHead.code + "."))
        .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}`, desc: p.code }))
    : partyOpts;
  const partyCodeByDesc = new Map(partyAccounts.map((p) => [p.description, p.code]));

  const convContracts = await db
    .select()
    .from(schema.extGreyConvContract)
    .orderBy(desc(schema.extGreyConvContract.id));
  const constructions = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction)
    .orderBy(schema.greyConstruction.description);
  const qualityByCode: Record<string, string> = Object.fromEntries(
    constructions.map((c) => [c.code, c.description])
  );
  const qualityOpts = constructions.map((c) => ({
    value: c.description,
    label: `${c.code} — ${c.description}`,
  }));
  const contractOpts = convContracts.map((c) => ({
    value: c.contNo,
    label: `${c.contNo} — ${c.party ?? ""}`,
    filterKey: c.party ?? "",
  }));
  const contractMap: Record<string, Record<string, string | number | null>> = Object.fromEntries(
    convContracts.map((c) => [
      c.contNo,
      {
        conv_rate: c.rateMtr ?? c.convRatePerMtr,
        grey_rate: c.grayRatePerMtr,
        dsp_quality: c.grayQltyCode ? qualityByCode[c.grayQltyCode] ?? "" : "",
      },
    ])
  );

  const nextVNoRow = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extKachiParchi.vNo}, 4) AS INTEGER)), 0)`,
    })
    .from(schema.extKachiParchi);
  const upcomingVNo = "KP-" + String((nextVNoRow[0]?.m ?? 0) + 1).padStart(4, "0");
  const upcomingKpNo = String((nextVNoRow[0]?.m ?? 0) + 1);

  const lastLvRow = await db
    .select({ m: sql<number>`coalesce(max(${schema.extKachiParchi.lvNo}), 0)` })
    .from(schema.extKachiParchi);
  const lastLvNo = lastLvRow[0]?.m ?? 0;

  let stockThanCalc: number | null = null;
  let stockMtrCalc: number | null = null;
  let avgCalc: number | null = null;
  if (formItem?.purchaseParty && formItem?.dspQuality) {
    // Replay every movement for this godown+quality in date order: purchases IN
    // (godown stock) and consumptions OUT (other kachi parchis). Balances and the
    // moving weighted-average rate use NET METER / net amount. IMPORTANT: whenever the
    // meter balance hits 0 the average lot RESETS — the next purchase's rate starts the
    // average fresh, never carrying the depleted lot forward.
    const insRows = await db
      .select({
        date: schema.extGodownStock.vDate,
        id: schema.extGodownStock.id,
        than: schema.extGodownStock.than,
        mtr: schema.extGodownStock.netMeter,
        rate: schema.extGodownStock.rate,
      })
      .from(schema.extGodownStock)
      .where(
        and(
          eq(schema.extGodownStock.gdnParty, formItem.purchaseParty),
          eq(schema.extGodownStock.dspQuality, formItem.dspQuality),
          eq(schema.extGodownStock.type, "STOCK")
        )
      );
    const outsRows = await db
      .select({
        date: schema.extKachiParchi.vDate,
        id: schema.extKachiParchi.id,
        than: schema.extKachiParchi.than,
        meter: schema.extKachiParchi.meter,
        elMeter: schema.extKachiParchi.elMeter,
        baadMeter: schema.extKachiParchi.baadMeter,
      })
      .from(schema.extKachiParchi)
      .where(
        and(
          eq(schema.extKachiParchi.purchaseParty, formItem.purchaseParty),
          eq(schema.extKachiParchi.dspQuality, formItem.dspQuality),
          sql`${schema.extKachiParchi.id} != ${formItem.id}`
        )
      );

    type Mv = { date: string; id: number; kind: "IN" | "OUT"; than: number; mtr: number; rate: number };
    const moves: Mv[] = [
      ...insRows.map((r) => ({ date: r.date ?? "", id: r.id, kind: "IN" as const, than: r.than ?? 0, mtr: r.mtr ?? 0, rate: r.rate ?? 0 })),
      ...outsRows.map((r) => ({
        date: r.date ?? "",
        id: r.id,
        kind: "OUT" as const,
        than: r.than ?? 0,
        mtr: (r.meter ?? 0) - (r.elMeter ?? 0) - (r.baadMeter ?? 0), // net consumed
        rate: 0,
      })),
    ].sort((a, b) =>
      a.date === b.date
        ? a.kind === b.kind
          ? a.id - b.id
          : a.kind === "IN" ? -1 : 1 // same day: purchases before consumptions
        : a.date.localeCompare(b.date)
    );

    const EPS = 0.001;
    let balThan = 0;
    let balMtr = 0;
    let accAmt = 0; // net amount of the CURRENT lot (since the last time balance hit 0)
    for (const mv of moves) {
      if (mv.kind === "IN") {
        balThan += mv.than;
        balMtr += mv.mtr;
        accAmt += mv.mtr * mv.rate;
      } else {
        const avg = balMtr > EPS ? accAmt / balMtr : 0;
        balThan -= mv.than;
        balMtr -= mv.mtr;
        accAmt -= mv.mtr * avg; // remove consumed value at the running average
      }
      if (balMtr <= EPS) accAmt = 0; // depleted → average restarts from scratch
    }
    stockThanCalc = Math.round(balThan * 100) / 100;
    stockMtrCalc = Math.round(balMtr * 100) / 100;
    avgCalc = balMtr > EPS ? Math.round((accAmt / balMtr) * 100) / 100 : null;
  }

  const gdnLineParty = formItem?.purchaseParty ?? (isAdding ? godownParty : "");
  let gdnLineOpts: { id: number; than: number | null; mtr: number | null; label: string }[] = [];
  if (gdnLineParty) {
    const lineConds = [
      eq(schema.extGodownStock.gdnParty, gdnLineParty),
      eq(schema.extGodownStock.type, "STOCK"),
    ];
    if (formItem?.dspQuality) {
      lineConds.push(eq(schema.extGodownStock.dspQuality, formItem.dspQuality));
    }
    const gdnLines = await db
      .select({
        id: schema.extGodownStockLine.id,
        than: schema.extGodownStockLine.than,
        mtr: schema.extGodownStockLine.mtr,
        status: schema.extGodownStockLine.status,
        vNo: schema.extGodownStock.vNo,
      })
      .from(schema.extGodownStockLine)
      .innerJoin(schema.extGodownStock, eq(schema.extGodownStockLine.stockId, schema.extGodownStock.id))
      .where(and(...lineConds))
      .orderBy(schema.extGodownStock.id, schema.extGodownStockLine.srNo);
    const usedByThis = new Set(lines.map((l) => l.gdnLineId).filter((g): g is number => g != null));
    gdnLineOpts = gdnLines
      .filter((r) => r.status !== "Y" || usedByThis.has(r.id))
      .map((r) => ({
        id: r.id,
        than: r.than,
        mtr: r.mtr,
        label: `${r.than ?? 0} than / ${r.mtr ?? 0} mtr (V#${r.vNo})`,
      }));
  }
  const gdnLineFillMap = Object.fromEntries(
    gdnLineOpts.map((o) => [String(o.id), { line_than: o.than, line_mtr: o.mtr }])
  );

  async function saveParchi(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const vDate = ((formData.get("v_date") as string) || "").trim() || today();
    const kpNo = txt(formData.get("kp_no"));
    const type = txt(formData.get("type")) ?? "STOCK";
    const purchaseParty = txt(formData.get("purchase_party"));
    const contNo = txt(formData.get("cont_no"));
    const salDate = txt(formData.get("sal_date"));
    const saleParty = txt(formData.get("sale_party"));
    const dspQuality = txt(formData.get("dsp_quality"));
    const qualityPrint = txt(formData.get("quality_print"));
    const than = intVal(formData.get("than"));
    const meter = num(formData.get("meter"));
    const convRate = num(formData.get("conv_rate"));
    const greyRate = num(formData.get("grey_rate"));
    const ratePur = num(formData.get("rate_pur"));
    const rateSal = num(formData.get("rate_sal"));
    const elCumiNum = intVal(formData.get("el_cumi_num"));
    const elCumiDen = intVal(formData.get("el_cumi_den"));
    const badCumiNum = intVal(formData.get("bad_cumi_num"));
    const badCumiDen = intVal(formData.get("bad_cumi_den"));
    const meterVal = meter ?? 0;
    const elMeter = Math.round(
      (meterVal * (elCumiNum ?? 0)) / ((elCumiDen ?? 0) === 5 ? 400 : 800)
    );
    const baadMeter = Math.round(
      (meterVal * (badCumiNum ?? 0)) / ((badCumiDen ?? 0) === 5 ? 400 : 800)
    );
    const totalElBadMtrs = elMeter + baadMeter;
    const printingName = txt(formData.get("printing_name"));
    const brokerName = txt(formData.get("broker_name"));
    const remarks = txt(formData.get("remarks"));
    const term = txt(formData.get("term"));
    const dueDate = term === "DUE" ? txt(formData.get("due_date")) : null;
    const imgNo = txt(formData.get("img_no"));

    if (!than || !meter) {
      redirect(`/external/grey/kachi-parchi?error=qty_required`);
    }

    const lineThan = formData.getAll("line_than") as string[];
    const lineMtr = formData.getAll("line_mtr") as string[];
    const lineGdn = formData.getAll("line_gdn_id") as string[];

    const validLines: { srNo: number; than: number | null; mtr: number | null; gdnLineId: number | null }[] = [];
    const lineRowCount = Math.max(lineThan.length, lineMtr.length, lineGdn.length);
    let srCounter = 1;
    for (let i = 0; i < lineRowCount; i++) {
      const t = intVal(lineThan[i] ?? null);
      const m = num(lineMtr[i] ?? null);
      const g = intVal(lineGdn[i] ?? null);
      if (t == null && m == null && g == null) continue;
      validLines.push({ srNo: srCounter++, than: t, mtr: m, gdnLineId: g });
    }
    const newGdnIds = [...new Set(validLines.map((l) => l.gdnLineId).filter((g): g is number => g != null))];

    const countCode = formData.getAll("count_code") as string[];
    const countType = formData.getAll("count_type") as string[];
    const countCal = formData.getAll("count_cal") as string[];
    const countEnds = formData.getAll("count_ends") as string[];
    const countRate = formData.getAll("count_rate") as string[];
    const countWt = formData.getAll("count_wt") as string[];
    const countCost = formData.getAll("count_cost") as string[];
    const countTot = formData.getAll("count_tot") as string[];

    const validCounts: {
      code: string | null;
      type: string | null;
      calCount: number | null;
      ends: number | null;
      ratePerLbs: number | null;
      wtPerMtr: number | null;
      costPerMtr: number | null;
      totLbs: number | null;
    }[] = [];
    const countRowCount = Math.max(
      countCode.length, countType.length, countCal.length, countEnds.length,
      countRate.length, countWt.length, countCost.length, countTot.length
    );
    for (let i = 0; i < countRowCount; i++) {
      const code = (countCode[i] || "").trim();
      const type = (countType[i] || "").trim();
      const cal = num(countCal[i]);
      const ends = intVal(countEnds[i]);
      const rate = num(countRate[i]);
      const wt = num(countWt[i]);
      const cost = num(countCost[i]);
      const tot = num(countTot[i]);
      if (!code && !type && cal == null && ends == null && rate == null && wt == null && cost == null && tot == null) continue;
      validCounts.push({
        code: code || null,
        type: type || null,
        calCount: cal,
        ends,
        ratePerLbs: rate,
        wtPerMtr: wt,
        costPerMtr: cost,
        totLbs: tot,
      });
    }

    const nowIso = new Date().toISOString();

    try {
      await assertPeriodOpen(vDate, "INVENTORY");

      if (Number.isFinite(id) && id > 0) {
        const prevOwnedIds = (
          await db
            .select({ g: schema.extKachiParchiLine.gdnLineId })
            .from(schema.extKachiParchiLine)
            .where(eq(schema.extKachiParchiLine.parchiId, id))
        )
          .map((l) => l.g)
          .filter((g): g is number => g != null);

        if (newGdnIds.length) {
          const foreignTaken = newGdnIds.filter((g) => !prevOwnedIds.includes(g));
          if (foreignTaken.length) {
            const conflicts = await db
              .select({ id: schema.extGodownStockLine.id, status: schema.extGodownStockLine.status })
              .from(schema.extGodownStockLine)
              .where(inArray(schema.extGodownStockLine.id, foreignTaken));
            if (conflicts.some((c) => c.status === "Y")) {
              redirect(`/external/grey/kachi-parchi?id=${id}&error=gdn_line_taken`);
            }
          }
        }

        await db.transaction(async (tx) => {
          if (prevOwnedIds.length) {
            await tx
              .update(schema.extGodownStockLine)
              .set({ status: "N" })
              .where(inArray(schema.extGodownStockLine.id, prevOwnedIds));
          }

          await tx
            .update(schema.extKachiParchi)
            .set({
              vDate, kpNo, type, purchaseParty, contNo, salDate, saleParty, dspQuality,
              qualityPrint, than, meter, convRate, greyRate,
              ratePur, rateSal, elCumiNum, elCumiDen, badCumiNum, badCumiDen, elMeter,
              baadMeter, totalElBadMtrs, printingName, brokerName, remarks, term, dueDate, imgNo,
              modifiedDate: nowIso,
            })
            .where(eq(schema.extKachiParchi.id, id));

          await tx.delete(schema.extKachiParchiLine).where(eq(schema.extKachiParchiLine.parchiId, id));
          await tx.delete(schema.extKachiParchiCount).where(eq(schema.extKachiParchiCount.parchiId, id));

          if (validLines.length) {
            await tx.insert(schema.extKachiParchiLine).values(validLines.map((l) => ({ ...l, parchiId: id })));
          }
          if (validCounts.length) {
            await tx.insert(schema.extKachiParchiCount).values(validCounts.map((c) => ({ ...c, parchiId: id })));
          }
          if (newGdnIds.length) {
            await tx
              .update(schema.extGodownStockLine)
              .set({ status: "Y" })
              .where(inArray(schema.extGodownStockLine.id, newGdnIds));
          }
        });

        revalidatePath("/external/grey/kachi-parchi");
        redirect(`/external/grey/kachi-parchi?id=${id}`);
      } else {
        const providedVNo = ((formData.get("v_no") as string) || "").trim();

        if (newGdnIds.length) {
          const conflicts = await db
            .select({ id: schema.extGodownStockLine.id, status: schema.extGodownStockLine.status })
            .from(schema.extGodownStockLine)
            .where(inArray(schema.extGodownStockLine.id, newGdnIds));
          if (conflicts.some((c) => c.status === "Y")) {
            redirect(`/external/grey/kachi-parchi?error=gdn_line_taken`);
          }
        }

        let newId = 0;
        let codeExists = false;
        try {
          newId = await db.transaction(async (tx) => {
            const existingRows = await tx
              .select({
                m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extKachiParchi.vNo}, 4) AS INTEGER)), 0)`,
              })
              .from(schema.extKachiParchi);
            const vNo = providedVNo || "KP-" + String((existingRows[0]?.m ?? 0) + 1).padStart(4, "0");
            const lvRow = await tx
              .select({ m: sql<number>`coalesce(max(${schema.extKachiParchi.lvNo}), 0)` })
              .from(schema.extKachiParchi);
            const nextL = (lvRow[0]?.m ?? 0) + 1;

            const inserted = await tx
              .insert(schema.extKachiParchi)
              .values({
                vNo, lvNo: nextL, vDate, kpNo, type, purchaseParty, contNo, salDate, saleParty,
                dspQuality, qualityPrint, than, meter, convRate, greyRate,
                ratePur, rateSal, elCumiNum, elCumiDen, badCumiNum, badCumiDen, elMeter,
                baadMeter, totalElBadMtrs, printingName, brokerName, remarks, term, dueDate, imgNo,
                postedDate: nowIso,
              })
              .returning({ id: schema.extKachiParchi.id });
            const insertedId = inserted[0].id;

            if (validLines.length) {
              await tx.insert(schema.extKachiParchiLine).values(validLines.map((l) => ({ ...l, parchiId: insertedId })));
            }
            if (validCounts.length) {
              await tx.insert(schema.extKachiParchiCount).values(validCounts.map((c) => ({ ...c, parchiId: insertedId })));
            }
            if (newGdnIds.length) {
              await tx
                .update(schema.extGodownStockLine)
                .set({ status: "Y" })
                .where(inArray(schema.extGodownStockLine.id, newGdnIds));
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
          redirect(`/external/grey/kachi-parchi?error=code_exists`);
        }

        revalidatePath("/external/grey/kachi-parchi");
        redirect(`/external/grey/kachi-parchi?id=${newId}`);
      }
    } catch (e: unknown) {
      const digest = (e as { digest?: string })?.digest ?? "";
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e;
      const msg = (e as { message?: string })?.message ?? "";
      const m = /Period locked through (\d{4}-\d{2}-\d{2})/.exec(msg);
      if (m) {
        redirect(`/external/grey/kachi-parchi?error=period_locked&thru=${m[1]}`);
      }
      throw e;
    }
  }

  async function deleteParchi(formData: FormData) {
    "use server";
    const s = await getSession();
    if (s?.roleName !== "ADMIN") redirect("/external/grey/kachi-parchi?error=admin_only");
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
      const prevLines = await tx
        .select({ g: schema.extKachiParchiLine.gdnLineId })
        .from(schema.extKachiParchiLine)
        .where(eq(schema.extKachiParchiLine.parchiId, id));
      const prevGdnIds = prevLines.map((l) => l.g).filter((g): g is number => g != null);
      if (prevGdnIds.length) {
        await tx
          .update(schema.extGodownStockLine)
          .set({ status: "N" })
          .where(inArray(schema.extGodownStockLine.id, prevGdnIds));
      }
      await tx.delete(schema.extKachiParchiCount).where(eq(schema.extKachiParchiCount.parchiId, id));
      await tx.delete(schema.extKachiParchiLine).where(eq(schema.extKachiParchiLine.parchiId, id));
      await tx.delete(schema.extKachiParchi).where(eq(schema.extKachiParchi.id, id));
    });
    revalidatePath("/external/grey/kachi-parchi");
    redirect("/external/grey/kachi-parchi");
  }

  const lineGrid: (typeof lines[number] | null)[] = Array.from(
    { length: Math.max(LINE_ROWS, lines.length) },
    (_, i) => lines[i] ?? null
  );

  const countGrid: (typeof counts[number] | null)[] = Array.from(
    { length: Math.max(COUNT_ROWS, counts.length) },
    (_, i) => counts[i] ?? null
  );

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const roCls = "input-box mono bg-gray-100";
  const gridCellCls = "input-box mono text-[13px] py-1";
  const gridCellNumCls = "input-box mono text-[13px] py-1 text-right";

  return (
    <Shell active="ext-kp">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">KACHI PARCHI</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {parchis.length} parchi{parchis.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={parchis.map((p) => ({
              vNo: p.vNo,
              vDate: p.vDate,
              kpNo: p.kpNo,
              purchaseParty: p.purchaseParty,
              saleParty: p.saleParty,
              meter: p.meter,
              totalElBadMtrs: p.totalElBadMtrs,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "V.Date" },
              { key: "kpNo", label: "KP No" },
              { key: "purchaseParty", label: "Purchase Party" },
              { key: "saleParty", label: "Sale Party" },
              { key: "meter", label: "Meter" },
              { key: "totalElBadMtrs", label: "Total EL+Bad Mtrs" },
            ]}
            filename="kachi-parchi"
            sheetName="KachiParchi"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            V.No already exists. Try again.
          </div>
        )}
        {params.error === "qty_required" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Than and Meter are required.
          </div>
        )}
        {params.error === "gdn_line_taken" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            One or more selected godown lines are already consumed by another parchi.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Period locked through {params.thru ?? "?"}. Nothing was saved.
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can delete records.
          </div>
        )}

        <form id="kp-find-form" method="GET" action="/external/grey/kachi-parchi" className="hidden"></form>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-3">
          <div className="xl:col-span-3">
            <div className="border border-black p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding
                    ? "New — KACHI PARCHI"
                    : formItem
                    ? `Edit — ${formItem.vNo}`
                    : "KACHI PARCHI"}
                </div>
                <div className="flex gap-2 no-print flex-wrap">
                  <a href="/external/grey/kachi-parchi?adding=1" className="btn btn-outline btn-sm">New</a>
                  <button type="submit" form="kp-save-form" className="btn btn-sm">Save</button>
                  <PrintButton label="Print" />
                  <a href="/external/grey/kachi-parchi" className="btn btn-outline btn-sm">Exit</a>
                  {formItem ? (
                    <form action={deleteParchi} className="inline">
                      <input type="hidden" name="id" value={formItem.id} />
                      <ConfirmButton>Del</ConfirmButton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled
                      title="Save the parchi first to enable delete"
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                    >
                      Del
                    </button>
                  )}
                </div>
              </div>

              <form id="kp-save-form" action={saveParchi}>
                {formItem && <input type="hidden" name="id" value={formItem.id} />}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3 gform">
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">V. Date</label>
                    <input
                      name="v_date"
                      type="date"
                      className="input-box mono"
                      defaultValue={formItem?.vDate ?? today()}
                      required
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">V.No</label>
                    <input
                      name="v_no"
                      className={roCls}
                      defaultValue={formItem?.vNo ?? upcomingVNo}
                      readOnly
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">LV.No</label>
                    <input
                      className={roCls + " text-center"}
                      defaultValue={formItem?.lvNo ?? lastLvNo}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Posted</label>
                    <input
                      className={roCls + " text-[12px]"}
                      defaultValue={formItem?.postedDate?.slice(0, 10) ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Modified</label>
                    <input
                      className={roCls + " text-[12px]"}
                      defaultValue={formItem?.modifiedDate?.slice(0, 10) ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="label block mb-1">KP No</label>
                    <input
                      name="kp_no"
                      className="input-box mono"
                      defaultValue={formItem?.kpNo ?? (isAdding ? upcomingKpNo : "")}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Type</label>
                    <select name="type" className="input-box mono" defaultValue={formItem?.type ?? "STOCK"}>
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      {formItem?.type && !TYPE_OPTIONS.includes(formItem.type) && (
                        <option value={formItem.type}>{formItem.type}</option>
                      )}
                    </select>
                  </div>
                  <div className="lg:col-span-7">
                    <label className="label block mb-1">Purchase Party</label>
                    <Combobox
                      name="purchase_party"
                      options={partyOpts}
                      defaultValue={formItem?.purchaseParty ?? (isAdding ? godownParty : "")}
                      placeholder="Select party…"
                    />
                  </div>

                  <div className="lg:col-span-4">
                    <label className="label block mb-1">Cont # <span className="text-[9px] text-[var(--muted)]">(party's)</span></label>
                    <Combobox
                      name="cont_no"
                      options={contractOpts}
                      defaultValue={formItem?.contNo ?? ""}
                      placeholder="Contract #…"
                      filterByField="purchase_party"
                    />
                    <AutoFill
                      watch="cont_no"
                      map={contractMap}
                      combos={["dsp_quality"]}
                      inputs={["conv_rate", "grey_rate"]}
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Sal Date</label>
                    <input
                      name="sal_date"
                      type="date"
                      className="input-box mono"
                      defaultValue={formItem?.salDate ?? (isAdding ? today() : "")}
                    />
                  </div>
                  <div className="lg:col-span-5">
                    <label className="label block mb-1">Sale Party</label>
                    <Combobox
                      name="sale_party"
                      options={partyOpts}
                      defaultValue={formItem?.saleParty ?? ""}
                      placeholder="Select party…"
                    />
                  </div>

                  <div className="lg:col-span-6">
                    <label className="label block mb-1">Dsp. Quality</label>
                    <Combobox
                      name="dsp_quality"
                      options={qualityOpts}
                      defaultValue={formItem?.dspQuality ?? ""}
                      placeholder="Quality…"
                    />
                  </div>
                  <div className="lg:col-span-6">
                    <label className="label block mb-1">Quality Print</label>
                    <input
                      name="quality_print"
                      className="input-box mono"
                      defaultValue={formItem?.qualityPrint ?? ""}
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Than</label>
                    <input
                      name="than"
                      type="number"
                      step="1"
                      className="input-box mono text-right"
                      defaultValue={formItem?.than ?? ""}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Meter</label>
                    <input
                      name="meter"
                      type="number"
                      step="any"
                      className="input-box mono text-right"
                      defaultValue={formItem?.meter ?? ""}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Conv Rate</label>
                    <input
                      name="conv_rate"
                      type="number"
                      step="any"
                      className="input-box mono text-right"
                      defaultValue={formItem?.convRate ?? ""}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Grey Rate</label>
                    <input
                      name="grey_rate"
                      type="number"
                      step="any"
                      className="input-box mono text-right"
                      defaultValue={formItem?.greyRate ?? ""}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Rate Pur</label>
                    <input
                      name="rate_pur"
                      type="number"
                      step="any"
                      className="input-box mono text-right"
                      defaultValue={formItem?.ratePur ?? ""}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Rate Sal</label>
                    <input
                      name="rate_sal"
                      type="number"
                      step="any"
                      className="input-box mono text-right"
                      defaultValue={formItem?.rateSal ?? ""}
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Stock Than</label>
                    <input
                      type="number"
                      step="1"
                      className={roCls + " text-right"}
                      defaultValue={stockThanCalc ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Stock Mtr</label>
                    <input
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      defaultValue={stockMtrCalc ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Avg</label>
                    <input
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      defaultValue={avgCalc ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Amt Pur</label>
                    <input
                      name="amt_pur_disp"
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Conv Amt</label>
                    <input
                      name="conv_amt_disp"
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="label block mb-1">EL-Cumi</label>
                    <div className="flex items-center gap-1">
                      <input
                        name="el_cumi_num"
                        type="number"
                        step="1"
                        className="input-box mono text-right"
                        defaultValue={formItem?.elCumiNum ?? ""}
                      />
                      <span className="mono text-[13px]">/</span>
                      <input
                        name="el_cumi_den"
                        type="number"
                        step="1"
                        className="input-box mono text-right"
                        defaultValue={formItem?.elCumiDen ?? ""}
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-3">
                    <label className="label block mb-1">Bad-Cumi</label>
                    <div className="flex items-center gap-1">
                      <input
                        name="bad_cumi_num"
                        type="number"
                        step="1"
                        className="input-box mono text-right"
                        defaultValue={formItem?.badCumiNum ?? ""}
                      />
                      <span className="mono text-[13px]">/</span>
                      <input
                        name="bad_cumi_den"
                        type="number"
                        step="1"
                        className="input-box mono text-right"
                        defaultValue={formItem?.badCumiDen ?? ""}
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">EL-Meter</label>
                    <input
                      name="el_meter"
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      defaultValue={formItem?.elMeter ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">BAAD-Meter</label>
                    <input
                      name="baad_meter"
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      defaultValue={formItem?.baadMeter ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Total EL+Bad Mtrs</label>
                    <input
                      name="total_el_bad_mtrs"
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      defaultValue={formItem?.totalElBadMtrs ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  <div className="lg:col-span-4">
                    <label className="label block mb-1">Printing Name <span className="text-[9px] text-[var(--muted)]">(printing parties)</span></label>
                    <Combobox
                      name="printing_name"
                      options={printingOpts}
                      defaultValue={formItem?.printingName ?? ""}
                      placeholder="Select printing party…"
                    />
                  </div>
                  <div className="lg:col-span-4">
                    <label className="label block mb-1">Broker Name</label>
                    <Combobox
                      name="broker_name"
                      options={partyOpts}
                      defaultValue={formItem?.brokerName ?? ""}
                      placeholder="Broker or free text…"
                    />
                  </div>
                  <div className="lg:col-span-4">
                    <label className="label block mb-1">Remarks</label>
                    <input
                      name="remarks"
                      className="input-box mono"
                      defaultValue={formItem?.remarks ?? ""}
                    />
                  </div>

                  <TermSelect
                    defaultTerm={formItem?.term ?? "CASH"}
                    defaultDate={formItem?.dueDate ?? ""}
                  />
                  <div className="lg:col-span-2">
                    <label className="label block mb-1">Img #</label>
                    <input
                      name="img_no"
                      className="input-box mono"
                      defaultValue={formItem?.imgNo ?? ""}
                    />
                  </div>
                  <div className="lg:col-span-6">
                    <label className="label block mb-1">Find</label>
                    <div className="flex gap-2">
                      <input
                        form="kp-find-form"
                        name="find"
                        className="input-box mono flex-1"
                        defaultValue={params.find ?? ""}
                        placeholder="v.no / kp / party / quality"
                      />
                      <button form="kp-find-form" type="submit" className="btn btn-outline btn-sm">Find</button>
                      {findFilter && <a href="/external/grey/kachi-parchi" className="btn btn-outline btn-sm">Clear</a>}
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                    Update Count ({COUNT_ROWS} rows)
                  </div>
                  <div className="overflow-x-auto border border-black">
                    <table style={{ minWidth: "1000px" }}>
                      <thead>
                        <tr>
                          <th style={{ width: "30px" }}>#</th>
                          <th>Code</th>
                          <th>Count Desc</th>
                          <th>Type</th>
                          <th className="text-right">Cal Count</th>
                          <th className="text-right">Ends</th>
                          <th className="text-right">Rate Per Lbs</th>
                          <th className="text-right">WT Per Mtr</th>
                          <th className="text-right">Cost Per Mtr</th>
                          <th className="text-right">TOT Lbs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {countGrid.map((row, i) => (
                          <tr key={row?.id ?? `ec-${i}`}>
                            <td className="mono text-[11px] text-center text-[var(--muted)]">{i + 1}</td>
                            <td><input name="count_code" list="kp-yarn-counts" className={gridCellCls} defaultValue={row?.code ?? ""} style={{ width: 60 }} /></td>
                            <td><input name="count_desc" className={gridCellCls} defaultValue={row?.code ? (kpCountDescByCode.get(String(row.code)) ?? "") : ""} readOnly tabIndex={-1} style={{ minWidth: 140, background: "#f3f4f6" }} /></td>
                            <td><input name="count_type" className={gridCellCls} defaultValue={row?.type ?? ""} style={{ width: 80 }} /></td>
                            <td><input name="count_cal" type="number" step="any" className={gridCellNumCls} defaultValue={row?.calCount ?? ""} /></td>
                            <td><input name="count_ends" type="number" step="1" className={gridCellNumCls} defaultValue={row?.ends ?? ""} /></td>
                            <td><input name="count_rate" type="number" step="any" className={gridCellNumCls} defaultValue={row?.ratePerLbs ?? ""} /></td>
                            <td><input name="count_wt" type="number" step="any" className={gridCellNumCls} defaultValue={row?.wtPerMtr ?? ""} /></td>
                            <td><input name="count_cost" type="number" step="any" className={gridCellNumCls} defaultValue={row?.costPerMtr ?? ""} /></td>
                            <td><input name="count_tot" type="number" step="any" className={gridCellNumCls} defaultValue={row?.totLbs ?? ""} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <KachiCalc />

                <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                  <a href="/external/grey/kachi-parchi?adding=1" className="btn btn-outline btn-sm">New</a>
                  <button type="submit" className="btn btn-sm">Save</button>
                  <PrintButton label="Print" />
                  <a href="/external/grey/kachi-parchi" className="btn btn-outline btn-sm">Exit</a>
                  <div className="ml-auto flex items-end gap-2">
                    <div>
                      <label className="label block mb-1">Alt-S Password</label>
                      <input className="input-box mono" placeholder="password" type="password" />
                    </div>
                    {formItem ? (
                      <form action={deleteParchi} className="inline">
                        <input type="hidden" name="id" value={formItem.id} />
                        <ConfirmButton>Delete</ConfirmButton>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled
                        title="Save the parchi first to enable delete"
                        style={{ opacity: 0.5, cursor: "not-allowed" }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>

          <div className="xl:col-span-1">
            <div className="border border-black">
              <div className="px-3 py-2 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold flex items-center justify-between">
                <span>Line Items ({LINE_ROWS})</span>
              </div>
              <div className="overflow-x-auto" style={{ maxHeight: "780px", overflowY: "auto" }}>
                <RowAutoFill watch="line_gdn_id" map={gdnLineFillMap} />
                <RowAutoFill watch="count_code" map={kpCountFillMap} />
                <datalist id="kp-yarn-counts">
                  {yarnCountList.map((c) => (
                    <option key={c.countCode} value={c.countCode}>{c.countCode} — {c.description}{c.type ? ` ${c.type}` : ""}</option>
                  ))}
                </datalist>
                <table className="w-full text-[11px]" style={{ minWidth: "320px" }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-1 py-1 border-b border-black" style={{ width: 30 }}>Sr#</th>
                      <th className="px-1 py-1 border-b border-black text-right">Than</th>
                      <th className="px-1 py-1 border-b border-black text-right">Mtr</th>
                      <th className="px-1 py-1 border-b border-black">Gdn Line</th>
                      <th className="px-1 py-1 border-b border-black" style={{ width: 22 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineGrid.map((r, idx) => {
                      const i = idx + 1;
                      return (
                        <tr key={r?.id ?? `el-${idx}`}>
                          <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i}</td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input
                              form="kp-save-form"
                              name="line_than"
                              type="number"
                              step="1"
                              className={gridCellNumCls}
                              defaultValue={r?.than ?? ""}
                            />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input
                              form="kp-save-form"
                              name="line_mtr"
                              type="number"
                              step="any"
                              className={gridCellNumCls}
                              defaultValue={r?.mtr ?? ""}
                            />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <select
                              form="kp-save-form"
                              name="line_gdn_id"
                              className={gridCellCls}
                              defaultValue={r?.gdnLineId ?? ""}
                            >
                              <option value="">—</option>
                              {r?.gdnLineId != null && !gdnLineOpts.some((o) => o.id === r.gdnLineId) && (
                                <option value={r.gdnLineId}>#{r.gdnLineId}</option>
                              )}
                              {gdnLineOpts.map((o) => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)] text-center text-[var(--muted)] cursor-pointer" title="Clear row">X</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            All Kachi Parchis
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>KP No</th>
                  <th>Purchase Party</th>
                  <th>Sale Party</th>
                  <th className="text-right">Meter</th>
                  <th className="text-right">Total EL+Bad Mtrs</th>
                </tr>
              </thead>
              <tbody>
                {parchis.map((p) => {
                  const isSel = p.id === selected?.id;
                  const href = `/external/grey/kachi-parchi?id=${p.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={p.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{p.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{p.vDate}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{p.kpNo ?? "-"}</a></td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {p.purchaseParty ?? "-"}
                          {p.purchaseParty && partyCodeByDesc.get(p.purchaseParty) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(p.purchaseParty)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {p.saleParty ?? "-"}
                          {p.saleParty && partyCodeByDesc.get(p.saleParty) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(p.saleParty)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-right mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(p.meter)}</a></td>
                      <td className="text-right mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(p.totalElBadMtrs)}</a></td>
                    </tr>
                  );
                })}
                {parchis.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-[13px] text-[var(--muted)] py-6">
                      No parchis. Click <b>New</b> above to create one.
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
