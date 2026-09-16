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

// Packi Parchi bill — the delivery-voucher sheet with the bill's money ladder
// dropped in beside the than/meter grid, the way the mill's own printed bill
// reads (Bill #, party, grey desc, than/mtr, rate, amount, kaat, checkery,
// commission, net amount, days, print, and the party's running balance).
export default async function PackiBillPage({
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

  // The bill states the PRINT quality — that is the whole point of the field:
  // stock is recorded under one construction, and what actually leaves may
  // differ a little, so the bill carries the printed one.
  const greyDesc = constrOf(pp.qualityPrint) || constrOf(pp.quality);

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
  const rate = n(pp.greyRateKp);
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

  // The ladder, exactly the order the printed bill lists it.
  const ladder: { label: string; a?: string; b?: string; bold?: boolean; rule?: boolean }[] = [
    { label: "Than", a: fmt(n(pp.than), 2), b: `Mtr   ${fmt(n(pp.kpMeter) || meterNet, 2)}` },
    { label: "Rejection", a: pp.meterRe != null ? fmt(n(pp.meterRe), 2) : "" },
    { label: "EL-Cumi", a: pp.elMeter != null ? fmt(n(pp.elMeter), 2) : "" },
    { label: "Mtr Kami", a: pp.meterKam != null ? fmt(n(pp.meterKam), 2) : "" },
    { label: "Net Mtr", a: fmt(meterNet, 2), rule: true },
    { label: "Rate", a: fmt(rate, 2) },
    { label: "Amount", a: fmt(amount, 2) },
    { label: "Kaat", a: "", b: fmt(kaatAmt, 2) },
    { label: "Checkery", a: pp.checkerySale != null ? fmt(n(pp.checkerySale), 2) : "", b: fmt(checkeryAmt, 2) },
    { label: "Commission", a: pp.commissionSale != null ? fmt(n(pp.commissionSale), 2) : "", b: fmt(commissionAmt, 2) },
    { label: "Net Amount", a: fmt(netAmount, 2), bold: true, rule: true },
    {
      label: "Days",
      a: pp.termSal ?? "",
      b: pp.dueDate ? `1     ${fmtDate(pp.dueDate)}` : "",
    },
    { label: "Print", a: pp.printingName ?? "" },
  ];

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 8mm 10mm; }
        @media print {
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

        .bv-body { display: flex; gap: 12px; align-items: flex-start; }
        .bv-grid-col { flex: 1 1 auto; min-width: 0; }
        .bv-ladder { flex: 0 0 300px; border: 1px solid #1e3a8a; }
        .bv-ladder-head { background: #1e3a8a; color: #fff; font-size: 8pt; font-weight: 700; letter-spacing: 0.08em; padding: 3px 8px; }
        .bv-l-row { display: flex; align-items: baseline; gap: 6px; padding: 2.5px 8px; font-size: 9.5pt; }
        .bv-l-row.rule { border-top: 1px solid #c7d2e3; }
        .bv-l-row.bold { background: #e8eef6; font-weight: 700; }
        .bv-l-label { flex: 0 0 82px; color: #475569; }
        .bv-l-a { flex: 1 1 auto; text-align: right; font-family: monospace; min-width: 0; }
        .bv-l-b { flex: 0 0 110px; text-align: right; font-family: monospace; }
        .bv-bal { border-top: 2px solid #1e3a8a; margin-top: 2px; }
        .bv-bal .bv-l-row { font-size: 9pt; }

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
          <PrintButton label="Print Bill" />
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
                <div className="bv-title">PAKKI PARCHI BILL</div>
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
                ["Stock Qlty", constrOf(pp.quality)],
              ] as [string, string][]).filter(([, v]) => v !== "")).map(([k, v]) => (
                <div className="bv-meta-row" key={k}>
                  <span className="bv-meta-label">{k}</span>
                  <span className="bv-meta-sep">:</span>
                  <span className="bv-meta-val">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bv-body">
            <div className="bv-grid-col">
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

            <div className="bv-ladder">
              <div className="bv-ladder-head">BILL</div>
              {ladder.map((l, i) => (
                <div key={i} className={`bv-l-row${l.rule ? " rule" : ""}${l.bold ? " bold" : ""}`}>
                  <span className="bv-l-label">{l.label}</span>
                  <span className="bv-l-a">{l.a ?? ""}</span>
                  <span className="bv-l-b">{l.b ?? ""}</span>
                </div>
              ))}
              <div className="bv-bal">
                <div className="bv-l-row"><span className="bv-l-label">Previous</span><span className="bv-l-a"></span><span className="bv-l-b">{fmt(previous, 0)}</span></div>
                <div className="bv-l-row"><span className="bv-l-label">Current Tran</span><span className="bv-l-a"></span><span className="bv-l-b">{fmt(netAmount, 0)}</span></div>
                <div className="bv-l-row bold"><span className="bv-l-label">Remaining</span><span className="bv-l-a"></span><span className="bv-l-b">{fmt(remaining, 0)}</span></div>
              </div>
            </div>
          </div>

          <div className="bv-words">
            <div className="bv-words-label">AMOUNT IN WORDS:</div>
            <div className="bv-words-val">{words || "—"}</div>
          </div>

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
