import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { numberToWords } from "@/lib/number-to-words";
import { countLabelMap, fullConstruction, normQuality } from "@/lib/grey-quality";
import { QrImage } from "@/app/weaving/beams/qr/qr-image";

export const dynamic = "force-dynamic";

// Conversion bill — the same sheet as the packi bill, billed on the CONV RATE
// the mill agreed against the conversion contract rather than the grey sale
// rate. The rate prints in its own box and the amount below it is always
// conv rate x net metre; checkery and commission come off that.
export default async function PackiConvBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isFinite(pid)) notFound();

  const [pp] = await db
    .select()
    .from(schema.extPackiParchi)
    .where(eq(schema.extPackiParchi.id, pid))
    .limit(1);
  if (!pp) notFound();

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const constructions = await db
    .select({
      code: schema.greyConstruction.code,
      description: schema.greyConstruction.description,
      reed: schema.greyConstruction.reed,
      pick: schema.greyConstruction.pick,
      warpCount: schema.greyConstruction.warpCount,
      warp2: schema.greyConstruction.warp2,
      weftCount: schema.greyConstruction.weftCount,
      weft2: schema.greyConstruction.weft2,
    })
    .from(schema.greyConstruction);
  const counts = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts);
  const labels = countLabelMap(counts);
  const codeSet = new Set(constructions.map((c) => c.code));
  const byCode = new Map(constructions.map((c) => [c.code, c]));
  const constrOf = (q: string | null | undefined) => {
    const code = normQuality(q, codeSet);
    const c = byCode.get(code);
    return c ? fullConstruction(c, labels) || c.description || code : code || "";
  };

  // The bill states the PRINT quality and nothing else. No falling back to the
  // stock quality when Quality Print is blank: that would leak what the godown
  // held onto a customer document precisely when nobody meant it to. A blank
  // here is visible and gets filled in; a wrong construction is not.
  const greyDesc = constrOf(pp.qualityPrint);
  // The printed bill carries the cloth width beside the construction.
  const [widthConstr] = await db
    .select({ width: schema.greyConstruction.width })
    .from(schema.greyConstruction)
    .where(eq(schema.greyConstruction.code, normQuality(pp.qualityPrint ?? pp.quality, codeSet)))
    .limit(1);

  // Piece rows come from the godown stock this parchi sold out of.
  const stockRows = pp.purchaseParty
    ? await db
        .select({ id: schema.extGodownStock.id, dspQuality: schema.extGodownStock.dspQuality })
        .from(schema.extGodownStock)
        .where(eq(schema.extGodownStock.gdnParty, pp.purchaseParty))
    : [];
  const myStockIds = stockRows
    .filter((s) => normQuality(s.dspQuality, codeSet) === normQuality(pp.quality, codeSet))
    .map((s) => s.id);
  const stockLines = myStockIds.length
    ? await db
        .select({ srNo: schema.extGodownStockLine.srNo, than: schema.extGodownStockLine.than, mtr: schema.extGodownStockLine.mtr })
        .from(schema.extGodownStockLine)
        .where(inArray(schema.extGodownStockLine.stockId, myStockIds))
        .orderBy(schema.extGodownStockLine.srNo)
    : [];

  const pieces: { sNo: number; mtrs: number }[] = [];
  let sNo = 1;
  for (const l of stockLines) {
    const n = l.than ?? 1;
    const each = l.mtr != null ? l.mtr / n : 0;
    for (let i = 0; i < n; i++) pieces.push({ sNo: sNo++, mtrs: each });
  }

  const COLS = 7;
  const MIN_ROWS = 25;
  const colLength = Math.max(MIN_ROWS, Math.ceil(pieces.length / COLS));
  const gridRows: { sNo: number | null; mtrs: number | null }[][] = [];
  for (let r = 0; r < colLength; r++) {
    const row: { sNo: number | null; mtrs: number | null }[] = [];
    for (let c = 0; c < COLS; c++) {
      const idx = c * colLength + r;
      row.push(idx < pieces.length ? pieces[idx] : { sNo: null, mtrs: null });
    }
    gridRows.push(row);
  }
  const colTotals = Array.from({ length: COLS }, (_, c) => {
    let t = 0;
    for (let r = 0; r < colLength; r++) {
      const idx = c * colLength + r;
      if (idx < pieces.length) t += pieces[idx].mtrs;
    }
    return t;
  });

  // ---- the money ladder, same arithmetic the parchi saves with ----
  const n = (v: number | null | undefined) => Number(v ?? 0);
  const rnd = (v: number) => Math.round(v * 100) / 100;
  const meterNet = n(pp.meterNet);

  // The conversion contract can sit in any of three fields depending on which
  // picker the operator used, so all three are tried before giving up.
  const convContNo = pp.convContSale2 ?? pp.convContNoSale ?? pp.convContNo ?? "";
  const [convContract] = convContNo
    ? await db
        .select({ convRatePerMtr: schema.extGreyConvContract.convRatePerMtr })
        .from(schema.extGreyConvContract)
        .where(eq(schema.extGreyConvContract.contNo, convContNo))
        .limit(1)
    : [];

  // This document bills the CONVERSION rate. The parchi's own rate wins when it
  // has one (the operator may nudge it per parchi); otherwise the contract's
  // agreed rate stands, which is what a parchi saved before that field existed
  // has behind it. Falling back to the grey SALE rate is never right — it would
  // quietly print a number several times too big.
  const rate = pp.convRate != null ? n(pp.convRate) : n(convContract?.convRatePerMtr);
  const amount = rnd(meterNet * rate);
  const kaatAmt = rnd((amount * n(pp.kaatPercentSale)) / 100);
  // Checkery is a rate per METER.
  const checkeryAmt = rnd(meterNet * n(pp.checkerySale));
  // Commission carries its own sign: -1 takes it off the bill, 1 adds it on.
  const commissionAmt = rnd((amount * n(pp.commissionSale)) / 100);
  const netAmount = rnd(amount + commissionAmt - kaatAmt - checkeryAmt);

  // ---- the party's running balance ----
  const partyName = pp.saleParty ?? "";
  const [partyAcc] = partyName
    ? await db
        .select({
          code: schema.chartOfAccounts.code,
          description: schema.chartOfAccounts.description,
          address: schema.chartOfAccounts.address,
          city: schema.chartOfAccounts.city,
          phone: schema.chartOfAccounts.phone,
          mobile: schema.chartOfAccounts.mobile,
        })
        .from(schema.chartOfAccounts)
        .where(
          or(
            eq(schema.chartOfAccounts.code, partyName),
            sql`upper(${schema.chartOfAccounts.description}) = upper(${partyName})`,
          ),
        )
        .limit(1)
    : [];

  let previous = 0;
  if (partyAcc?.code && pp.vDate) {
    const [row] = await db
      .select({
        dr: sql<number>`COALESCE(SUM(${schema.transDetail.debit}),0)`,
        cr: sql<number>`COALESCE(SUM(${schema.transDetail.credit}),0)`,
      })
      .from(schema.transDetail)
      .innerJoin(
        schema.transMain,
        and(eq(schema.transMain.vtype, schema.transDetail.vtype), eq(schema.transMain.vno, schema.transDetail.vno)),
      )
      .where(and(eq(schema.transDetail.accCode, partyAcc.code), lt(schema.transMain.vdate, pp.vDate)));
    previous = rnd(Number(row?.dr ?? 0) - Number(row?.cr ?? 0));
  }
  const remaining = rnd(previous + netAmount);

  const fmt = (v: number | null | undefined, dp = 2) =>
    v == null ? "" : new Intl.NumberFormat("en-PK", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(v);
  const fmtDate = (iso: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
    return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso ?? "");
  };

  let words = numberToWords(netAmount, "").trim().replace(/\s*only\.?$/i, "");
  if (words) words = words.charAt(0).toUpperCase() + words.slice(1) + " Only.";

  const printedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true,
  });

  type ToLine = { icon: "person" | "pin" | "phone" | "globe"; text: string };
  const billTo: ToLine[] = ([
    { icon: "person", text: partyName },
    { icon: "pin", text: pp.printingName ?? "" },
    { icon: "globe", text: partyAcc?.address ?? "" },
    { icon: "globe", text: partyAcc?.city ?? "" },
    { icon: "phone", text: [partyAcc?.phone, partyAcc?.mobile].filter(Boolean).join(" · ") },
  ] as ToLine[]).filter((l) => l.text && l.text.trim() !== "");

  const ToIcon = ({ kind }: { kind: ToLine["icon"] }) => {
    const p = {
      person: <><circle cx="8" cy="5.5" r="2.6" /><path d="M2.6 14c0-3 2.4-4.6 5.4-4.6s5.4 1.6 5.4 4.6" /></>,
      pin: <><path d="M8 1.6c2.6 0 4.6 2 4.6 4.5C12.6 9.6 8 14.4 8 14.4S3.4 9.6 3.4 6.1C3.4 3.6 5.4 1.6 8 1.6Z" /><circle cx="8" cy="6" r="1.7" /></>,
      phone: <path d="M3 2.4h3l1.2 3-1.6 1.3a9 9 0 0 0 3.7 3.7l1.3-1.6 3 1.2v3c0 .6-.5 1-1.1 1C7.2 14 2 8.8 2 3.5c0-.6.4-1.1 1-1.1Z" />,
      globe: <><circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4M8 1.8c3 3.4 3 9 0 12.4M8 1.8c-3 3.4-3 9 0 12.4" /></>,
    }[kind];
    return (
      <svg className="bv-to-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {p}
      </svg>
    );
  };

  // The bill, top to bottom, the order the mill reads it: what came in, what was
  // knocked off it, what is owed. Quantity rows carry their own rate and amount
  // where they have one, so Net Meter states the money on the same line instead
  // of leaving the reader to pair it up with a rate further down.
  type BillRow = {
    label: string;
    qty?: string;
    rate?: string;
    amount?: string;
    kind?: "qty" | "sub" | "adj" | "net";
  };
  const sign = (v: number) => (v > 0 ? `+${fmt(v, 2)}` : v < 0 ? `−${fmt(Math.abs(v), 2)}` : fmt(0, 2));
  const billRows: BillRow[] = [
    { label: "Than", qty: fmt(n(pp.than), 2), kind: "qty" },
    { label: "Meter", qty: fmt(n(pp.kpMeter) || meterNet, 2), kind: "qty" },
    { label: "Rejection", qty: pp.meterRe != null ? fmt(n(pp.meterRe), 2) : "—", kind: "qty" },
    { label: "EL-Cumi", qty: pp.elMeter != null ? fmt(n(pp.elMeter), 2) : "—", kind: "qty" },
    { label: "Mtr Kami", qty: pp.meterKam != null ? fmt(n(pp.meterKam), 2) : "—", kind: "qty" },
    { label: "Net Meter × Conv Rate", qty: fmt(meterNet, 2), rate: fmt(rate, 2), amount: fmt(amount, 2), kind: "sub" },
    { label: "Commission", qty: pp.commissionSale != null ? `${fmt(n(pp.commissionSale), 2)} %` : "—", amount: sign(commissionAmt), kind: "adj" },
    { label: "Checkery", qty: pp.checkerySale != null ? `${fmt(n(pp.checkerySale), 2)} / mtr` : "—", amount: checkeryAmt ? `−${fmt(checkeryAmt, 2)}` : fmt(0, 2), kind: "adj" },
    { label: "Kaat", qty: pp.kaatPercentSale != null ? `${fmt(n(pp.kaatPercentSale), 2)} %` : "—", amount: kaatAmt ? `−${fmt(kaatAmt, 2)}` : fmt(0, 2), kind: "adj" },
    { label: "Net Amount", amount: fmt(netAmount, 2), kind: "net" },
  ];

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 8mm 10mm; }
        @media print {
          /* Browsers drop background fills when printing unless told otherwise.
             The grid header is white text on a navy fill, so without this the
             whole header printed blank and the table read as an empty box. */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .bv-page { box-shadow: none !important; border: none !important; margin: 0 !important; max-width: none !important; }
          .bv-wrap { padding: 0 !important; background: #fff !important; }
        }
        .bv-wrap { background: var(--bg); min-height: 100vh; padding: 24px 12px; }
        .bv-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .bv-page { background: #fff; color: #111; max-width: 210mm; margin: 0 auto; padding: 9mm; border: 1px solid var(--border); font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.35; }

        .bv-stamp { display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b; margin-bottom: 4px; }
        .bv-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .bv-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .bv-title { font-size: 22pt; font-weight: 800; letter-spacing: 0.02em; color: #1e3a8a; line-height: 1.05; }
        .bv-company { font-size: 8.5pt; color: #475569; margin-top: 1px; }
        .bv-head-right { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
        .bv-rule { border: 0; border-top: 2px solid #1e3a8a; margin: 6px 0 0; }
        .bv-tagline { text-align: center; font-size: 9pt; font-style: italic; color: #1e3a8a; margin: 4px 0 10px; }

        .bv-band { display: flex; align-items: stretch; margin-bottom: 10px; }
        .bv-band-left { flex: 1 1 52%; min-width: 0; padding-right: 14px; }
        .bv-band-right { flex: 1 1 48%; min-width: 0; padding-left: 14px; border-left: 1px solid #cbd5e1; }
        .bv-chip { display: inline-block; background: #1e3a8a; color: #fff; font-size: 8pt; font-weight: 700; letter-spacing: 0.06em; padding: 2px 8px; margin-bottom: 6px; }
        .bv-to-row { display: flex; gap: 7px; align-items: baseline; margin-bottom: 2px; }
        .bv-to-icon { flex: 0 0 13px; color: #1e3a8a; position: relative; top: 2px; }
        .bv-to-val { font-size: 9.5pt; min-width: 0; word-break: break-word; }
        .bv-to-val.name { font-weight: 700; text-transform: uppercase; }
        .bv-meta-row { display: flex; align-items: baseline; font-size: 9.5pt; padding: 1.5px 0; }
        .bv-meta-label { flex: 0 0 82px; color: #475569; }
        .bv-meta-sep { flex: 0 0 8px; color: #94a3b8; }
        .bv-meta-val { flex: 1 1 auto; min-width: 0; font-weight: 700; text-transform: uppercase; word-break: break-word; }

        /* ---- the bill itself ---- */
        table.bv-bill { width: 100%; border-collapse: collapse; margin-top: 4px; }
        table.bv-bill th {
          background: #1e3a8a; color: #fff; font-size: 8pt; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; text-align: right;
        }
        table.bv-bill td { padding: 4px 10px; font-size: 10pt; border-bottom: 1px solid #e2e8f0; }
        .bv-c-label { color: #334155; }
        .bv-c-num { text-align: right; font-family: monospace; white-space: nowrap; }
        .bv-c-amt { font-weight: 600; }
        /* Quantity rows are the tally; the sub row is where the money starts. */
        .bv-r-sub td { border-top: 1.5px solid #1e3a8a; font-weight: 700; background: #f5f8fd; }
        .bv-r-adj .bv-c-label { padding-left: 22px; color: #64748b; }
        .bv-r-net td {
          border-top: 2px solid #1e3a8a; border-bottom: 2px solid #1e3a8a;
          background: #1e3a8a; color: #fff; font-weight: 700; font-size: 12pt; padding: 6px 10px;
        }

        .bv-after { display: flex; gap: 14px; align-items: flex-start; margin-top: 12px; }
        .bv-after-l { flex: 1 1 auto; min-width: 0; }
        .bv-print-line { display: flex; gap: 8px; align-items: baseline; margin-top: 6px; font-size: 9.5pt; }
        .bv-print-val { font-weight: 700; text-transform: uppercase; }
        .bv-l-label { flex: 0 0 82px; color: #475569; font-size: 9.5pt; }
        .bv-bal { flex: 0 0 270px; border: 1px solid #1e3a8a; }
        .bv-bal-row { display: flex; justify-content: space-between; gap: 10px; padding: 4px 10px; font-size: 9.5pt; }
        .bv-bal-row span:last-child { font-family: monospace; font-weight: 700; }
        .bv-bal-row.net { background: #e8eef6; border-top: 1.5px solid #1e3a8a; font-weight: 700; }

        .bv-pieces { margin-top: 12px; }
        .bv-pieces-head { font-size: 8pt; font-weight: 700; letter-spacing: 0.08em; color: #1e3a8a; margin-bottom: 3px; }

        table.bv-grid { width: 100%; border-collapse: collapse; }
        table.bv-grid th, table.bv-grid td { border: 1px solid #c7d2e3; padding: 1px 3px; font-size: 8pt; }
        table.bv-grid td { height: 12px; }
        table.bv-grid th { background: #1e3a8a; color: #fff; font-weight: 700; text-align: center; letter-spacing: 0.04em; }
        table.bv-grid th:nth-child(even) { text-align: right; }
        table.bv-grid td:nth-child(odd) { text-align: center; color: #64748b; width: 20px; }
        table.bv-grid td:nth-child(even) { text-align: right; font-weight: 600; }
        .bv-grid-totals td { background: #e8eef6; font-weight: 700 !important; border-top: 2px solid #1e3a8a; }

        .bv-words { border: 1px solid #1e3a8a; padding: 6px 9px; margin-top: 10px; }
        .bv-words-label { font-size: 8pt; font-weight: 700; color: #1e3a8a; letter-spacing: 0.05em; margin-bottom: 2px; }
        .bv-words-val { font-size: 9pt; font-style: italic; color: #334155; }
        .bv-thanks { text-align: center; font-size: 9.5pt; font-style: italic; color: #1e3a8a; margin: 12px 0 8px; }
        .bv-sign { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .bv-recv { flex: 1 1 auto; }
        .bv-recv-title { font-size: 8pt; font-weight: 700; color: #1e3a8a; letter-spacing: 0.05em; margin-bottom: 6px; }
        .bv-recv-line { display: flex; align-items: baseline; gap: 6px; font-size: 9pt; color: #475569; margin-bottom: 5px; }
        .bv-recv-rule { flex: 0 0 150px; border-bottom: 1px solid #94a3b8; height: 11px; }
        .bv-auth { flex: 0 0 200px; text-align: center; }
        .bv-auth-title { font-size: 8pt; font-weight: 700; color: #1e3a8a; letter-spacing: 0.05em; margin-bottom: 34px; }
        .bv-auth-rule { border-top: 1px solid #334155; margin-bottom: 4px; }
        .bv-auth-for { font-size: 8.5pt; color: #475569; }
      `}</style>

      <div className="bv-wrap">
        <div className="bv-toolbar no-print">
          <Link href="/external/grey/packi-parchi" className="btn btn-outline btn-sm">Back</Link>
          <PrintButton label="Print Conversion Bill" />
        </div>

        <div className="bv-page">
          <div className="bv-stamp">
            <span>{printedAt}</span>
            <span>Page 1 of 1</span>
          </div>

          <div className="bv-head">
            <div className="bv-head-left">
              <svg width="34" height="28" viewBox="0 0 34 28" fill="none" stroke="#1e3a8a" strokeWidth="2.2" strokeLinecap="round">
                <rect x="4" y="3" width="22" height="22" rx="2" />
                <path d="M9 10h12M9 15h12M9 20h7" />
              </svg>
              <div style={{ minWidth: 0 }}>
                <div className="bv-title">CONVERSION BILL</div>
                <div className="bv-company">
                  {company?.name ?? ""}
                  {company?.address ? ` · ${company.address}` : ""}
                  {company?.phone ? ` · ${company.phone}` : ""}
                </div>
              </div>
            </div>
            <div className="bv-head-right">
              <div style={{ textAlign: "center", fontSize: "7pt", color: "#64748b" }}>
                <QrImage value="https://wa.me/923232201515" size={48} />
                <div style={{ marginTop: 1, fontWeight: 700 }}>WhatsApp Us</div>
              </div>
              <img src="/sk-logo.png" alt={company?.name ?? "Logo"} style={{ height: 52, objectFit: "contain" }} />
            </div>
          </div>
          <hr className="bv-rule" />
          <div className="bv-tagline">Thank you for your business!</div>

          <div className="bv-band">
            <div className="bv-band-left">
              <div className="bv-chip">BILL TO</div>
              {billTo.length > 0 ? (
                billTo.map((l, i) => (
                  <div className="bv-to-row" key={i}>
                    <ToIcon kind={l.icon} />
                    <span className={`bv-to-val${i === 0 ? " name" : ""}`}>{l.text}</span>
                  </div>
                ))
              ) : (
                <div className="bv-to-val" style={{ color: "#94a3b8" }}>—</div>
              )}
            </div>
            <div className="bv-band-right">
              {(([
                ["Bill #", pp.vNo ?? ""],
                ["PP No.", pp.ppNo ?? ""],
                ["Date", fmtDate(pp.vDate)],
                ["Grey Desc", greyDesc],
                ["Width", widthConstr?.width != null ? `${widthConstr.width}"` : ""],
                ["Conv Cont", convContNo],
                ["Conv Rate", rate > 0 ? `${fmt(rate, 2)} / mtr` : "NOT SET"],
                // Stock quality is deliberately NOT on the bill. The party is
                // told what was SENT, never what the godown held — the whole
                // reason Quality Print exists is that the two can differ.
              ] as [string, string][]).filter(([, v]) => v !== "")).map(([k, v]) => (
                <div className="bv-meta-row" key={k}>
                  <span className="bv-meta-label">{k}</span>
                  <span className="bv-meta-sep">:</span>
                  <span className="bv-meta-val">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <table className="bv-bill">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Description</th>
                <th>Quantity</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {billRows.map((r, i) => (
                <tr key={i} className={`bv-r-${r.kind ?? "qty"}`}>
                  <td className="bv-c-label">{r.label}</td>
                  <td className="bv-c-num">{r.qty ?? ""}</td>
                  <td className="bv-c-num">{r.rate ?? ""}</td>
                  <td className="bv-c-num bv-c-amt">{r.amount ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bv-after">
            <div className="bv-after-l">
              <div className="bv-words">
                <div className="bv-words-label">AMOUNT IN WORDS:</div>
                <div className="bv-words-val">{words || "—"}</div>
              </div>
              <div className="bv-print-line">
                <span className="bv-l-label">Printing</span>
                <span className="bv-print-val">{pp.printingName ?? "—"}</span>
              </div>
              {pp.termSal && (
                <div className="bv-print-line">
                  <span className="bv-l-label">Days</span>
                  <span className="bv-print-val">
                    {pp.termSal}{pp.dueDate ? `  ·  ${fmtDate(pp.dueDate)}` : ""}
                  </span>
                </div>
              )}
            </div>
            <div className="bv-bal">
              <div className="bv-bal-row"><span>Previous</span><span>{fmt(previous, 0)}</span></div>
              <div className="bv-bal-row"><span>Current Tran</span><span>{fmt(netAmount, 0)}</span></div>
              <div className="bv-bal-row net"><span>Remaining Balance</span><span>{fmt(remaining, 0)}</span></div>
            </div>
          </div>

          {pieces.length > 0 && (
            <div className="bv-pieces">
              <div className="bv-pieces-head">THAN DETAIL — {pieces.length} PIECES</div>
              <table className="bv-grid">
                <thead>
                  <tr>
                    {Array.from({ length: COLS }).map((_, c) => (
                      <React.Fragment key={c}>
                        <th>S#</th><th>Mtrs</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <React.Fragment key={cIdx}>
                          <td>{cell.sNo ?? ""}</td>
                          <td>{cell.mtrs != null ? fmt(cell.mtrs, 2) : ""}</td>
                        </React.Fragment>
                      ))}
                    </tr>
                  ))}
                  <tr className="bv-grid-totals">
                    {colTotals.map((t, c) => (
                      <React.Fragment key={c}>
                        <td></td><td>{t > 0 ? fmt(t, 2) : ""}</td>
                      </React.Fragment>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="bv-thanks">We appreciate your business!</div>

          <div className="bv-sign">
            <div className="bv-recv">
              <div className="bv-recv-title">RECEIVED IN GOOD CONDITION</div>
              <div className="bv-recv-line"><span style={{ flex: "0 0 60px" }}>Name</span><span className="bv-recv-rule" /></div>
              <div className="bv-recv-line"><span style={{ flex: "0 0 60px" }}>Signature</span><span className="bv-recv-rule" /></div>
              <div className="bv-recv-line"><span style={{ flex: "0 0 60px" }}>Date</span><span className="bv-recv-rule" /></div>
            </div>
            <div className="bv-auth">
              <div className="bv-auth-title">AUTHORIZED SIGNATURE</div>
              <div className="bv-auth-rule" />
              <div className="bv-auth-for">for {company?.name ?? ""}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
