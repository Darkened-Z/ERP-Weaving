import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowAutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

function nextVNoFromRows(rows: { vNo: string }[]): string {
  const nums = rows
    .map((r) => {
      const m = r.vNo?.match(/^IKS-(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return "IKS-" + String(next).padStart(4, "0");
}

const LINE_ROWS = 15;

async function saveKnotting(formData: FormData) {
  "use server";
  try {
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  await assertPeriodOpen(txt(formData.get("v_date")) ?? today(), "INVENTORY");

  const header = {
    vDate: txt(formData.get("v_date")) ?? today(),
    party: txt(formData.get("party")),
    type: txt(formData.get("type")),
    ratePerEnds: num(formData.get("rate_per_ends")),
    ratePerBeam: num(formData.get("rate_per_beam")),
    warpContNoyy: txt(formData.get("warp_cont_noyy")),
    findDate: txt(formData.get("find_date")),
    unPostedBills: txt(formData.get("un_posted_bills")),
    delBill: txt(formData.get("del_bill")),
    billingStatus: txt(formData.get("billing_status")),
    billNo: txt(formData.get("bill_no")),
    billDate: txt(formData.get("bill_date")),
    billingAllowed: txt(formData.get("billing_allowed")),
    rem: txt(formData.get("rem")),
  };

  const beamSetNos = formData.getAll("beam_set_no") as string[];
  const setNos = formData.getAll("set_no") as string[];
  const beamNos = formData.getAll("beam_no") as string[];
  const noOfBeams = formData.getAll("no_of_beam_hash") as string[];
  const beamLengths = formData.getAll("beam_length") as string[];
  const issueDates = formData.getAll("issue_date") as string[];
  const kDates = formData.getAll("k_date") as string[];
  const shdHashes = formData.getAll("shd_hash") as string[];
  const lmHashes = formData.getAll("lm_hash") as string[];
  const extShrAges = formData.getAll("ext_shr_age") as string[];
  const dspTypes = formData.getAll("dsp_type") as string[];
  const knContNos = formData.getAll("kn_cont_no") as string[];
  const endsList = formData.getAll("ends") as string[];
  const amounts = formData.getAll("amount") as string[];
  const extraChargers = formData.getAll("extra_charger") as string[];
  const extAmts = formData.getAll("ext_amt") as string[];
  const netAmts = formData.getAll("net_amt") as string[];
  const wts = formData.getAll("wt") as string[];
  const mtrs = formData.getAll("mtr") as string[];
  const lHashes = formData.getAll("l_hash") as string[];
  const kAndLs = formData.getAll("k_and_l") as string[];

  const lines: (typeof schema.intKnottingSarningLine.$inferInsert)[] = [];
  const rpe = header.ratePerEnds ?? 0;
  const rpb = header.ratePerBeam ?? 0;
  const rowCount = Math.max(
    beamSetNos.length,
    beamLengths.length,
    knContNos.length,
  );
  for (let i = 0; i < rowCount; i++) {
    const beamSetNo = (beamSetNos[i] ?? "").trim();
    const setNo = (setNos[i] ?? "").trim();
    const beamNo = (beamNos[i] ?? "").trim();
    const noOfBeam = intVal(noOfBeams[i]);
    const beamLength = num(beamLengths[i]);
    const issueDate = (issueDates[i] ?? "").trim();
    const kDate = (kDates[i] ?? "").trim();
    const shdHash = (shdHashes[i] ?? "").trim();
    const lmHash = (lmHashes[i] ?? "").trim();
    const extShrAge = num(extShrAges[i]);
    const dspType = (dspTypes[i] ?? "").trim();
    const knContNo = (knContNos[i] ?? "").trim();
    const ends = intVal(endsList[i]);
    const amount = num(amounts[i]);
    const extraCharger = num(extraChargers[i]);
    const extAmt = num(extAmts[i]);
    const netAmt = num(netAmts[i]);
    const wt = num(wts[i]);
    const mtr = num(mtrs[i]);
    const lHash = (lHashes[i] ?? "").trim();
    const kAndL = (kAndLs[i] ?? "").trim();

    const hasAny =
      beamSetNo ||
      setNo ||
      beamNo ||
      noOfBeam !== null ||
      beamLength !== null ||
      issueDate ||
      kDate ||
      shdHash ||
      lmHash ||
      extShrAge !== null ||
      dspType ||
      knContNo ||
      ends !== null ||
      amount !== null ||
      extraCharger !== null ||
      extAmt !== null ||
      netAmt !== null ||
      wt !== null ||
      mtr !== null ||
      lHash ||
      kAndL;
    if (!hasAny) continue;

    const cAmount =
      rpe > 0
        ? ends != null
          ? Math.round(ends * rpe * 100) / 100
          : null
        : rpb > 0
        ? rpb
        : null;
    const cNetAmt =
      cAmount != null || extAmt != null
        ? Math.round(((cAmount ?? 0) + (extAmt ?? 0)) * 100) / 100
        : null;

    lines.push({
      knottingId: 0,
      srNo: lines.length + 1,
      beamSetNo: beamSetNo || null,
      setNo: setNo || null,
      noOfBeamHash: noOfBeam,
      beamNo: beamNo || null,
      beamLength,
      issueDate: issueDate || null,
      kDate: kDate || header.vDate,
      shdHash: shdHash || null,
      lmHash: lmHash || null,
      extShrAge,
      dspType: dspType || null,
      knContNo: knContNo || null,
      ends,
      amount: cAmount,
      extraCharger,
      extAmt,
      netAmt: cNetAmt,
      wt,
      mtr,
      lHash: lHash || null,
      kAndL: kAndL || null,
    });
  }

  if (lines.some((l) => l.beamNo && !l.lmHash)) {
    redirect(
      Number.isFinite(id) && id > 0
        ? `/inventory/knotting?id=${id}&error=loom_required`
        : `/inventory/knotting?adding=1&error=loom_required`,
    );
  }

  const nowIso = new Date().toISOString();

  if (Number.isFinite(id) && id > 0) {
    await db.transaction(async (tx) => {
      // Snapshot the old mounted lines so we can reverse the side-effects of
      // mountBeam (looms + beams) for every line that had a loom assigned.
      const oldLines = await tx
        .select({
          beamNo: schema.intKnottingSarningLine.beamNo,
          lmHash: schema.intKnottingSarningLine.lmHash,
        })
        .from(schema.intKnottingSarningLine)
        .where(eq(schema.intKnottingSarningLine.knottingId, id));

      for (const ol of oldLines) {
        const loomNo = ol.lmHash ? parseInt(ol.lmHash, 10) : NaN;
        if (Number.isFinite(loomNo)) {
          await tx
            .update(schema.looms)
            .set({ statusWrk: "S", currentBeam: null, currentContract: null })
            .where(eq(schema.looms.loomNo, loomNo));
        }
        if (ol.beamNo) {
          await tx
            .update(schema.beams)
            .set({ statusWrk: "LOADED", loomNo: null, knVno: null, knDate: null })
            .where(eq(schema.beams.beamNo, ol.beamNo));
        }
      }

      await tx
        .update(schema.intKnottingSarning)
        .set({ ...header, modifiedDate: nowIso })
        .where(eq(schema.intKnottingSarning.id, id));

      await tx
        .delete(schema.intKnottingSarningLine)
        .where(eq(schema.intKnottingSarningLine.knottingId, id));

      if (lines.length) {
        await tx
          .insert(schema.intKnottingSarningLine)
          .values(lines.map((l) => ({ ...l, knottingId: id })));
      }
    });
    revalidatePath("/inventory/knotting");
    redirect(`/inventory/knotting?id=${id}`);
  } else {
    let newId = 0;
    let codeExists = false;
    try {
      newId = await db.transaction(async (tx) => {
        const existingRows = await tx
          .select({
            vNo: schema.intKnottingSarning.vNo,
            lvNo: schema.intKnottingSarning.lvNo,
          })
          .from(schema.intKnottingSarning);
        const providedVNo = txt(formData.get("v_no"));
        const vNo = providedVNo || nextVNoFromRows(existingRows);
        const nextLv = existingRows.reduce((m, r) => Math.max(m, r.lvNo ?? 0), 0) + 1;

        const inserted = await tx
          .insert(schema.intKnottingSarning)
          .values({
            ...header,
            vNo,
            lvNo: nextLv,
            postedDate: nowIso,
          })
          .returning({ id: schema.intKnottingSarning.id });
        const insertedId = inserted[0].id;

        if (lines.length) {
          await tx
            .insert(schema.intKnottingSarningLine)
            .values(lines.map((l) => ({ ...l, knottingId: insertedId })));
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
      redirect(`/inventory/knotting?error=code_exists`);
    }
    revalidatePath("/inventory/knotting");
    redirect(`/inventory/knotting?id=${newId}`);
  }
  } catch (e) {
    const err = e as { message?: string; digest?: string };
    if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
    const thru = parseLockedThroughFromError(err.message ?? "");
    if (thru) redirect(`/inventory/knotting?error=period_locked&thru=${thru}`);
    throw e;
  }
}

async function deleteKnotting(formData: FormData) {
  "use server";
  const session = await getSession();
  if (session?.roleName !== "ADMIN") redirect("/inventory/knotting?error=admin_only");
  const id = intVal(formData.get("id"));
  if (id === null) return;
  await db.transaction(async (tx) => {
    const oldLines = await tx
      .select({
        beamNo: schema.intKnottingSarningLine.beamNo,
        lmHash: schema.intKnottingSarningLine.lmHash,
      })
      .from(schema.intKnottingSarningLine)
      .where(eq(schema.intKnottingSarningLine.knottingId, id));
    for (const ol of oldLines) {
      const loomNo = ol.lmHash ? parseInt(ol.lmHash, 10) : NaN;
      if (Number.isFinite(loomNo)) {
        await tx
          .update(schema.looms)
          .set({ statusWrk: "S", currentBeam: null, currentContract: null })
          .where(eq(schema.looms.loomNo, loomNo));
      }
      if (ol.beamNo) {
        await tx
          .update(schema.beams)
          .set({ statusWrk: "LOADED", loomNo: null, knVno: null, knDate: null })
          .where(eq(schema.beams.beamNo, ol.beamNo));
      }
    }
    await tx
      .delete(schema.intKnottingSarningLine)
      .where(eq(schema.intKnottingSarningLine.knottingId, id));
    await tx
      .delete(schema.intKnottingSarning)
      .where(eq(schema.intKnottingSarning.id, id));
  });
  revalidatePath("/inventory/knotting");
  redirect("/inventory/knotting");
}

async function deleteBillKnotting(formData: FormData) {
  "use server";
  const id = intVal(formData.get("id"));
  if (id === null) return;
  await db
    .update(schema.intKnottingSarning)
    .set({
      billNo: null,
      billDate: null,
      billingStatus: null,
      delBill: "Y",
      modifiedDate: new Date().toISOString(),
    })
    .where(eq(schema.intKnottingSarning.id, id));
  revalidatePath("/inventory/knotting");
  redirect(`/inventory/knotting?id=${id}`);
}

async function mountBeam(formData: FormData) {
  "use server";
  const lineId = intVal(formData.get("mount_line_id"));
  if (lineId === null) return;
  const rows = await db
    .select({
      line: schema.intKnottingSarningLine,
      vNo: schema.intKnottingSarning.vNo,
      vDate: schema.intKnottingSarning.vDate,
      knottingId: schema.intKnottingSarning.id,
    })
    .from(schema.intKnottingSarningLine)
    .innerJoin(
      schema.intKnottingSarning,
      eq(schema.intKnottingSarningLine.knottingId, schema.intKnottingSarning.id),
    )
    .where(eq(schema.intKnottingSarningLine.id, lineId));
  const row = rows[0];
  if (!row) redirect("/inventory/knotting");
  const { line } = row;
  const loomNo = line.lmHash ? parseInt(line.lmHash, 10) : NaN;
  if (!line.beamNo || !Number.isFinite(loomNo)) {
    redirect(`/inventory/knotting?id=${row.knottingId}&error=loom_required`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(schema.looms)
      .set({
        statusWrk: "RUNNING",
        currentBeam: line.beamNo,
        ...(line.knContNo ? { currentContract: line.knContNo } : {}),
      })
      .where(eq(schema.looms.loomNo, loomNo));
    await tx
      .update(schema.beams)
      .set({
        statusWrk: "RUNNING",
        loomNo,
        knVno: row.vNo,
        knDate: line.kDate ?? row.vDate,
        ...(line.setNo ? { setNo: line.setNo } : {}),
        ...(line.beamSetNo ? { beamSetNo: line.beamSetNo } : {}),
      })
      .where(eq(schema.beams.beamNo, line.beamNo!));
  });
  revalidatePath("/inventory/knotting");
  redirect(`/inventory/knotting?id=${row.knottingId}`);
}

export default async function KnottingPage({
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

  const bills = findFilter
    ? await db
        .select()
        .from(schema.intKnottingSarning)
        .where(
          sql`${schema.intKnottingSarning.vNo} LIKE ${
            "%" + escapeLike(findFilter) + "%"
          } ESCAPE '\\' OR ${schema.intKnottingSarning.party} LIKE ${
            "%" + escapeLike(findFilter) + "%"
          } ESCAPE '\\' OR ${schema.intKnottingSarning.warpContNoyy} LIKE ${
            "%" + escapeLike(findFilter) + "%"
          } ESCAPE '\\'`,
        )
        .orderBy(desc(schema.intKnottingSarning.id))
        .limit(200)
    : await db
        .select()
        .from(schema.intKnottingSarning)
        .orderBy(desc(schema.intKnottingSarning.id))
        .limit(200);

  const selected = isEditing ? bills.find((b) => b.id === idParam) ?? null : null;
  const formBill = isAdding ? null : selected;

  const lines = formBill
    ? await db
        .select()
        .from(schema.intKnottingSarningLine)
        .where(eq(schema.intKnottingSarningLine.knottingId, formBill.id))
        .orderBy(schema.intKnottingSarningLine.srNo)
    : [];

  const allVNos = await db
    .select({ vNo: schema.intKnottingSarning.vNo })
    .from(schema.intKnottingSarning);
  const upcomingVNo = nextVNoFromRows(allVNos);
  const lastLvNo =
    (
      await db
        .select({ maxLv: sql<number>`coalesce(max(${schema.intKnottingSarning.lvNo}), 0)` })
        .from(schema.intKnottingSarning)
    )[0]?.maxLv ?? 0;

  const knContracts = await db
    .select({
      party: schema.intKnottingContract.party,
      ratePerEnds: schema.intKnottingContract.ratePerEnds,
      ratePerBeam: schema.intKnottingContract.ratePerBeam,
      type: schema.intKnottingContract.type,
      contDate: schema.intKnottingContract.contDate,
    })
    .from(schema.intKnottingContract)
    .where(eq(schema.intKnottingContract.status, "R"))
    .orderBy(desc(schema.intKnottingContract.contDate));

  const partyMap = new Map<string, { rate_per_ends?: number | null; rate_per_beam?: number | null; type?: string | null }>();
  for (const c of knContracts) {
    if (!c.party) continue;
    if (partyMap.has(c.party)) continue;
    partyMap.set(c.party, {
      rate_per_ends: c.ratePerEnds,
      rate_per_beam: c.ratePerBeam,
      type: c.type,
    });
  }
  const partyOpts = Array.from(partyMap.keys())
    .sort()
    .map((p) => ({ value: p, label: p }));
  const partyFillMap = Object.fromEntries(partyMap.entries());

  const partyAccounts = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 4`);
  const partyDescByCode = new Map(partyAccounts.map((p) => [String(p.code), p.description]));

  const loadedBeams = await db
    .select({
      beamNo: schema.beams.beamNo,
      statusWrk: schema.beams.statusWrk,
      beamSetNo: schema.beams.beamSetNo,
      setNo: schema.beams.setNo,
      beamLength: schema.beams.length,
      ends: schema.beams.ends,
    })
    .from(schema.beams)
    .where(eq(schema.beams.statusWrk, "LOADED"))
    .orderBy(schema.beams.beamNo);
  const beamFillMap = Object.fromEntries(
    loadedBeams.map((b) => [
      b.beamNo,
      { beam_set_no: b.beamSetNo, set_no: b.setNo, beam_length: b.beamLength, ends: b.ends },
    ]),
  );

  const loomRows = await db
    .select({
      loomNo: schema.looms.loomNo,
      statusWrk: schema.looms.statusWrk,
      shed: schema.looms.shed,
    })
    .from(schema.looms)
    .orderBy(
      sql`CASE WHEN ${schema.looms.statusWrk} = 'RUNNING' THEN 1 ELSE 0 END`,
      schema.looms.loomNo,
    );

  const showForm = !!formBill || isAdding;
  const rowsToShow = Math.max(LINE_ROWS, lines.length + 3);

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  return (
    <Shell active="knotting">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">KNOTTING / MAROORI / SARNING BILL (WVG)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {bills.length} bill{bills.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={bills.map((b) => ({
              vNo: b.vNo,
              vDate: b.vDate,
              party: b.party,
              type: b.type,
              warpContNoyy: b.warpContNoyy,
              ratePerEnds: b.ratePerEnds,
              ratePerBeam: b.ratePerBeam,
              billNo: b.billNo,
              billDate: b.billDate,
              billingStatus: b.billingStatus,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "party", label: "Party" },
              { key: "type", label: "Type" },
              { key: "warpContNoyy", label: "Warp Contnoyy" },
              { key: "ratePerEnds", label: "Rate Per Ends" },
              { key: "ratePerBeam", label: "Rate Per Beam" },
              { key: "billNo", label: "Bill No" },
              { key: "billDate", label: "Bill Date" },
              { key: "billingStatus", label: "Billing Status" },
            ]}
            filename="knotting-sarning-bills"
            sheetName="Knotting"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            V.No already exists. Try again.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Period is locked. Cannot save for this date
            {params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
            .
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can delete vouchers.
          </div>
        )}

        <form
          id="ks-find-form"
          method="GET"
          action="/inventory/knotting"
          className="hidden"
        ></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — KNOTTING / MAROORI / SARNING BILL (WVG)"
                : formBill
                ? `Edit — ${formBill.vNo}`
                : "KNOTTING / MAROORI / SARNING BILL (WVG)"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/knotting?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              {showForm && (
                <button type="submit" form="ks-save-form" className="btn btn-sm">
                  Save
                </button>
              )}
              <PrintButton label="Print" />
              {formBill && (
                <>
                  <form action={deleteBillKnotting} className="inline">
                    <input type="hidden" name="id" value={formBill.id} />
                    <button type="submit" className="btn btn-outline btn-sm">
                      Del Bill
                    </button>
                  </form>
                  <form action={deleteKnotting} className="inline">
                    <input type="hidden" name="id" value={formBill.id} />
                    <ConfirmButton message="Delete this voucher permanently? This cannot be undone.">
                      Delete
                    </ConfirmButton>
                  </form>
                </>
              )}
              <a href="/inventory/knotting" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          {showForm ? (
            <form id="ks-save-form" action={saveKnotting}>
              {formBill && <input type="hidden" name="id" value={formBill.id} />}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Date</label>
                  <input
                    name="v_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formBill?.vDate ?? today()}
                    required
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Warp Contnoyy</label>
                  <input
                    name="warp_cont_noyy"
                    className="input-box mono"
                    defaultValue={formBill?.warpContNoyy ?? ""}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Find Date</label>
                  <input
                    name="find_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formBill?.findDate ?? ""}
                  />
                </div>
                <div className="lg:col-span-1 flex items-end">
                  {formBill ? (
                    <button
                      type="submit"
                      formAction={deleteBillKnotting}
                      className="btn btn-outline btn-sm w-full"
                      title="Nulls Bill No / Date only"
                    >
                      Del Bill
                    </button>
                  ) : (
                    <button type="button" disabled className="btn btn-outline btn-sm w-full opacity-50" title="Del Bill (select a bill first)">Del Bill</button>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">V. No</label>
                  <input
                    name="v_no"
                    className="input-box mono bg-gray-100"
                    defaultValue={formBill?.vNo ?? upcomingVNo}
                    readOnly
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Un-Posted Bills</label>
                  <input
                    name="un_posted_bills"
                    className="input-box mono"
                    defaultValue={formBill?.unPostedBills ?? ""}
                  />
                </div>

                <div className="lg:col-span-4">
                  <label className="label block mb-1">Party</label>
                  <Combobox
                    name="party"
                    options={partyOpts}
                    defaultValue={formBill?.party ?? ""}
                    placeholder="knotting contract party"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Type</label>
                  <select
                    name="type"
                    className="input-box mono"
                    defaultValue={formBill?.type ?? "KNOTTING"}
                  >
                    <option value="KNOTTING">KNOTTING</option>
                    <option value="SARNING">SARNING</option>
                    <option value="MAROORI">MAROORI</option>
                    {formBill?.type && !["KNOTTING", "SARNING", "MAROORI"].includes(formBill.type) && (
                      <option value={formBill.type}>{formBill.type}</option>
                    )}
                  </select>
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Rate Per Ends</label>
                  <input
                    name="rate_per_ends"
                    type="number"
                    step="any"
                    className="input-box mono"
                    defaultValue={formBill?.ratePerEnds ?? ""}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Rate Per Beam</label>
                  <input
                    name="rate_per_beam"
                    type="number"
                    step="any"
                    className="input-box mono"
                    defaultValue={formBill?.ratePerBeam ?? ""}
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="label block mb-1">LV.No</label>
                  <input
                    className="input-box mono bg-gray-100 text-center"
                    defaultValue={formBill?.lvNo ?? lastLvNo}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Posted</label>
                  <input
                    className="input-box mono bg-gray-100 text-[12px]"
                    defaultValue={formBill?.postedDate?.slice(0, 10) ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Modified</label>
                  <input
                    className="input-box mono bg-gray-100 text-[12px]"
                    defaultValue={formBill?.modifiedDate?.slice(0, 10) ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-4">
                  <label className="label block mb-1">Find</label>
                  <div className="flex gap-2">
                    <input
                      form="ks-find-form"
                      name="find"
                      className="input-box mono flex-1"
                      defaultValue={params.find ?? ""}
                      placeholder="V.No / Party / Warp Contnoyy"
                    />
                    <button
                      form="ks-find-form"
                      type="submit"
                      className="btn btn-outline btn-sm"
                    >
                      Find
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-3">
                  <div className="border border-black p-3 text-center">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em]">
                      BILLING STAUTS
                    </div>
                    <input
                      name="billing_status"
                      className="input-box mono mt-2 text-center"
                      defaultValue={formBill?.billingStatus ?? ""}
                    />
                  </div>
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Bill No</label>
                  <input
                    name="bill_no"
                    className="input-box mono"
                    defaultValue={formBill?.billNo ?? ""}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Bill Date</label>
                  <input
                    name="bill_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formBill?.billDate ?? ""}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Billing Allowed</label>
                  <input
                    name="billing_allowed"
                    className="input-box mono"
                    defaultValue={formBill?.billingAllowed ?? ""}
                  />
                </div>

                <div className="lg:col-span-12">
                  <label className="label block mb-1">Rem</label>
                  <input
                    name="rem"
                    className="input-box"
                    defaultValue={formBill?.rem ?? ""}
                  />
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                  Line Items
                </div>
                <div className="overflow-x-auto border border-black">
                  <table className="mono text-[12px]" style={{ minWidth: 1600 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Sr#</th>
                        <th style={{ width: 110 }}>Beam Set No</th>
                        <th style={{ width: 90 }}>Set No</th>
                        <th style={{ width: 80 }}>No Of Width</th>
                        <th style={{ width: 70 }}>Beam #</th>
                        <th style={{ width: 90 }}>Beam Length</th>
                        <th style={{ width: 130 }}>Issue Date</th>
                        <th style={{ width: 130 }}>K-Date</th>
                        <th style={{ width: 60 }}>Shd#</th>
                        <th style={{ width: 60 }}>Lm#</th>
                        <th style={{ width: 90 }}>Ext Shr.Age</th>
                        <th style={{ width: 90 }}>Dsg Type</th>
                        <th style={{ width: 110 }}>Kn.Cont.No</th>
                        <th style={{ width: 70 }}>Ends</th>
                        <th style={{ width: 90 }}>Amount</th>
                        <th style={{ width: 100 }}>Extra Charger</th>
                        <th style={{ width: 90 }}>Ext Amt</th>
                        <th style={{ width: 90 }}>Net Amt</th>
                        <th style={{ width: 70 }}>Wt</th>
                        <th style={{ width: 70 }}>/Mtr</th>
                        <th style={{ width: 50 }}>L#</th>
                        <th style={{ width: 70 }}>K&amp;L</th>
                        <th style={{ width: 50 }}>Upd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: rowsToShow }).map((_, i) => {
                        const l = lines[i];
                        const headerVDate = formBill?.vDate ?? today();
                        return (
                          <tr key={i}>
                            <td className="text-[var(--muted)] text-center">
                              {i + 1}
                            </td>
                            <td>
                              <input
                                name="beam_set_no"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.beamSetNo ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="set_no"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.setNo ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="no_of_beam_hash"
                                type="number"
                                step="1"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.noOfBeamHash ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="beam_no"
                                list="ks-beam-list"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.beamNo ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="beam_length"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.beamLength ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="issue_date"
                                type="date"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.issueDate ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="k_date"
                                type="date"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.kDate ?? headerVDate}
                              />
                            </td>
                            <td>
                              <input
                                name="shd_hash"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.shdHash ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="lm_hash"
                                list="ks-loom-list"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.lmHash ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="ext_shr_age"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.extShrAge ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="dsp_type"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.dspType ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="kn_cont_no"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.knContNo ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="ends"
                                type="number"
                                step="1"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.ends ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="amount"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.amount ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="extra_charger"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.extraCharger ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="ext_amt"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.extAmt ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="net_amt"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.netAmt ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="wt"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.wt ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="mtr"
                                type="number"
                                step="any"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.mtr ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="l_hash"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.lHash ?? ""}
                              />
                            </td>
                            <td>
                              <input
                                name="k_and_l"
                                className="input-box mono text-[12px]"
                                defaultValue={l?.kAndL ?? ""}
                              />
                            </td>
                            <td className="text-center text-[10px]">
                              {l?.id ? (
                                <button
                                  type="submit"
                                  form={`ks-mount-${l.id}`}
                                  className="btn btn-outline btn-sm"
                                  title="Mount beam on loom (RUNNING)"
                                >
                                  U
                                </button>
                              ) : (
                                <span className="text-[var(--muted)]">U</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-2">
                  Note:- Beam Length, K.Date, Loom#, Shr.Age, Set Status UpDate Only Press Buten &apos;U&apos;
                </div>
              </div>

              <datalist id="ks-beam-list">
                {loadedBeams.map((b) => (
                  <option key={b.beamNo} value={b.beamNo}>
                    {b.statusWrk}
                  </option>
                ))}
              </datalist>
              <datalist id="ks-loom-list">
                {loomRows.map((lm) => (
                  <option key={lm.loomNo} value={String(lm.loomNo)}>
                    {(lm.statusWrk ?? "") + (lm.shed ? " · " + lm.shed : "")}
                  </option>
                ))}
              </datalist>
              <RowAutoFill watch="beam_no" map={beamFillMap} />
              <AutoFill watch="party" map={partyFillMap} inputs={["rate_per_ends", "rate_per_beam", "type"]} />

              <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">
                  Save
                </button>
                <a href="/inventory/knotting?adding=1" className="btn btn-outline btn-sm">
                  New
                </a>
                <PrintButton label="Print" />
                <a href="/inventory/knotting" className="btn btn-outline btn-sm">
                  Exit
                </a>
                <div className="ml-auto flex items-end gap-2">
                  <div>
                    <label className="label block mb-1">Pswd</label>
                    <input
                      type="password"
                      name="pswd"
                      className="input-box mono w-40"
                    />
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <div className="text-[13px] text-[var(--muted)] py-6 text-center">
              Select a bill from the list below, or click <b>New</b> to create one.
            </div>
          )}
          {showForm && lines.length > 0 && (
            <div className="hidden">
              {lines.map((l) => (
                <form key={l.id} id={`ks-mount-${l.id}`} action={mountBeam}>
                  <input type="hidden" name="mount_line_id" value={l.id} />
                </form>
              ))}
            </div>
          )}
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Bills
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V. No</th>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Type</th>
                  <th>Warp Contnoyy</th>
                  <th className="text-right">Rate/Ends</th>
                  <th className="text-right">Rate/Beam</th>
                  <th>Bill No</th>
                  <th>Bill Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const isSel = b.id === selected?.id;
                  const href = `/inventory/knotting?id=${b.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr
                      key={b.id}
                      className={
                        isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"
                      }
                    >
                      <td className="mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {b.vNo}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {b.vDate}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          <div>{b.party ?? "-"}</div>
                          {b.party && partyDescByCode.get(b.party) && (
                            <div className="text-[11px] text-[var(--muted)]">{partyDescByCode.get(b.party)}</div>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {b.type ?? "-"}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {b.warpContNoyy ?? "-"}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(b.ratePerEnds)}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(b.ratePerBeam)}
                        </a>
                      </td>
                      <td className="mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {b.billNo ?? "-"}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {b.billDate ?? "-"}
                        </a>
                      </td>
                      <td className="text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {b.billingStatus ?? "-"}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {bills.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="text-center text-[13px] text-[var(--muted)] py-6"
                    >
                      No bills. Click <b>New</b> above to create one.
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
