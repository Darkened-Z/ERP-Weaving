import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { numberToWords } from "@/lib/number-to-words";
import { countLabelMap, fullConstruction } from "@/lib/grey-quality";
import { QrImage } from "@/app/weaving/beams/qr/qr-image";

export const dynamic = "force-dynamic";

export default async function DamiVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const damiId = Number(id);
  if (!Number.isFinite(damiId)) notFound();

  const [dami] = await db
    .select()
    .from(schema.intGreyDespatchDami)
    .where(eq(schema.intGreyDespatchDami.id, damiId))
    .limit(1);

  if (!dami) notFound();

  const lines = await db
    .select()
    .from(schema.intGreyDespatchDamiLine)
    .where(eq(schema.intGreyDespatchDamiLine.damiId, damiId))
    .orderBy(schema.intGreyDespatchDamiLine.srNo);

  // Everything on the letterhead comes from the company profile, so the voucher
  // follows whatever /settings holds rather than carrying a name in the markup.
  const [company] = await db.select().from(schema.companyProfile).limit(1);

  // Whoever the goods go to. Purchase Party and Sub Party are off the entry form
  // at the client's request, so Sale Party is normally the one that is filled —
  // but a voucher written before that still has its own value, hence the chain.
  const partyName = dami.party ?? dami.subParty ?? dami.saleParty ?? "";
  const [partyAcc] = partyName
    ? await db
        .select({
          description: schema.chartOfAccounts.description,
          address: schema.chartOfAccounts.address,
          city: schema.chartOfAccounts.city,
          phone: schema.chartOfAccounts.phone,
          mobile: schema.chartOfAccounts.mobile,
          email: schema.chartOfAccounts.email,
          ntn: schema.chartOfAccounts.ntn,
          gstNo: schema.chartOfAccounts.gstNo,
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

  // "GC-001" means nothing to whoever receives the cloth — print the construction
  // it stands for (reed x pick, warp x weft counts) when the slip did not store a
  // description of its own.
  // The construction master is the source of truth, not the copy stored on the
  // slip: a slip saved before the "always show it in full" rule carries the old
  // collapsed text, and reprinting it would keep showing half a quality. Derive
  // whenever the slip names a code; the stored line only stands in when it does
  // not (a hand-written quality with no code behind it).
  const qualityCode = dami.dspQuality ?? "";
  let greyLine = qualityCode ? "" : dami.dspQualityDesc ?? "";
  if (qualityCode) {
    const [constr] = await db
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
      .from(schema.greyConstruction)
      .where(eq(schema.greyConstruction.code, qualityCode))
      .limit(1);
    if (constr) {
      const counts = await db
        .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
        .from(schema.yarnCounts);
      greyLine = fullConstruction(constr, countLabelMap(counts)) || constr.description || qualityCode;
    }
  }
  if (!greyLine) greyLine = dami.dspQualityDesc ?? qualityCode;

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  // Day-first, like every other date the mill reads.
  const formatDate = (iso: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "");
  };

  const totalMtrs = dami.mtrs ?? lines.reduce((s, l) => s + (l.mtrs ?? 0), 0);
  const totalThan = dami.than ?? lines.reduce((s, l) => s + (l.than ?? 0), 0);

  // Expand lines into individual piece entries (each than = one row)
  const pieces: { sNo: number; mtrs: number }[] = [];
  let sNo = 1;
  for (const line of lines) {
    const count = line.than ?? 1;
    const mtrEach = line.mtrs != null ? line.mtrs / count : 0;
    for (let i = 0; i < count; i++) {
      pieces.push({ sNo: sNo++, mtrs: mtrEach });
    }
  }

  // Seven S#/Mtrs pairs across, 25 rows down — the layout of the printed book,
  // so one voucher of ~87 thans lands on a single page instead of spilling.
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

  // The book prints "(Nine thousand Four Hundred Eighty-Eight Only.)".
  let words = numberToWords(totalMtrs, "").trim();
  words = words.replace(/\s*only\.?$/i, "");
  if (words) words = words.charAt(0).toUpperCase() + words.slice(1) + " Meters Only.";

  const printedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  // Deliver-to lines, each with the mark that says what it is — a line the party
  // has no data for simply does not print. Despatch Loc sits here rather than in
  // the right-hand column: it is where the cloth is going, so it belongs with the
  // address, not with the voucher's own numbers.
  type ToLine = { icon: "person" | "pin" | "mail" | "phone" | "globe" | "id"; text: string };
  const deliverTo: ToLine[] = ([
    { icon: "person", text: partyName },
    { icon: "pin", text: dami.printingLocation ?? "" },
    { icon: "globe", text: partyAcc?.address ?? "" },
    { icon: "globe", text: partyAcc?.city ?? "" },
    { icon: "phone", text: [partyAcc?.phone, partyAcc?.mobile].filter(Boolean).join(" · ") },
    { icon: "mail", text: partyAcc?.email ?? "" },
    { icon: "id", text: partyAcc?.ntn ? `NTN ${partyAcc.ntn}` : "" },
  ] as ToLine[]).filter((l) => l.text && l.text.trim() !== "");

  // Right-hand meta column — the voucher's own identity, label : value.
  const meta: [string, string][] = [
    ["Voucher No.", dami.vNo ?? ""],
    ["Book #", dami.lvNo != null ? String(dami.lvNo) : ""],
    ["Date", formatDate(dami.vDate)],
    ["Contract #", dami.contNo ?? ""],
    ["Product", dami.productDesc ?? dami.product ?? ""],
    ["Grey", greyLine],
    ["Width", dami.width != null ? String(dami.width) : ""],
  ].filter(([, v]) => v !== "") as [string, string][];

  const ToIcon = ({ kind }: { kind: ToLine["icon"] }) => {
    const p = {
      person: <><circle cx="8" cy="5.5" r="2.6" /><path d="M2.6 14c0-3 2.4-4.6 5.4-4.6s5.4 1.6 5.4 4.6" /></>,
      pin: <><path d="M8 1.6c2.6 0 4.6 2 4.6 4.5C12.6 9.6 8 14.4 8 14.4S3.4 9.6 3.4 6.1C3.4 3.6 5.4 1.6 8 1.6Z" /><circle cx="8" cy="6" r="1.7" /></>,
      mail: <><rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1" /><path d="m1.8 4.4 6.2 4.6 6.2-4.6" /></>,
      phone: <path d="M3 2.4h3l1.2 3-1.6 1.3a9 9 0 0 0 3.7 3.7l1.3-1.6 3 1.2v3c0 .6-.5 1-1.1 1C7.2 14 2 8.8 2 3.5c0-.6.4-1.1 1-1.1Z" />,
      globe: <><circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4M8 1.8c3 3.4 3 9 0 12.4M8 1.8c-3 3.4-3 9 0 12.4" /></>,
      id: <><rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1" /><path d="M4.4 10.4h3.2M4.4 7.6h7.2" /></>,
    }[kind];
    return (
      <svg className="dv-to-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {p}
      </svg>
    );
  };

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
          .dv-page { box-shadow: none !important; border: none !important; margin: 0 !important; max-width: none !important; }
          .dv-wrap { padding: 0 !important; background: #fff !important; }
        }

        .dv-wrap { background: var(--bg); min-height: 100vh; padding: 24px 12px; }
        .dv-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .dv-page {
          background: #fff; color: #111; max-width: 210mm; margin: 0 auto; padding: 9mm 9mm;
          border: 1px solid var(--border); font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.35;
        }

        /* ---- masthead ---- */
        .dv-stamp { display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b; margin-bottom: 4px; }
        .dv-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .dv-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .dv-truck { color: #1e3a8a; flex: 0 0 auto; }
        .dv-title { font-size: 22pt; font-weight: 800; letter-spacing: 0.02em; color: #1e3a8a; line-height: 1.05; }
        .dv-company { font-size: 8.5pt; color: #475569; margin-top: 1px; }
        .dv-head-right { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
        .dv-rule { border: 0; border-top: 2px solid #1e3a8a; margin: 6px 0 0; }
        .dv-tagline { text-align: center; font-size: 9pt; font-style: italic; color: #1e3a8a; margin: 4px 0 10px; }

        /* ---- info band ---- */
        .dv-band { display: flex; gap: 0; align-items: stretch; margin-bottom: 10px; }
        .dv-band-left { flex: 1 1 52%; min-width: 0; padding-right: 14px; }
        .dv-band-right { flex: 1 1 48%; min-width: 0; padding-left: 14px; border-left: 1px solid #cbd5e1; }
        .dv-chip { display: inline-block; background: #1e3a8a; color: #fff; font-size: 8pt; font-weight: 700; letter-spacing: 0.06em; padding: 2px 8px; margin-bottom: 6px; }
        .dv-to-row { display: flex; gap: 7px; align-items: baseline; margin-bottom: 2px; }
        .dv-to-icon { flex: 0 0 13px; color: #1e3a8a; position: relative; top: 2px; }
        .dv-to-val { font-size: 9.5pt; min-width: 0; word-break: break-word; }
        .dv-to-val.name { font-weight: 700; text-transform: uppercase; }
        .dv-meta-row { display: flex; align-items: baseline; font-size: 9.5pt; padding: 1.5px 0; }
        /* Fixed label column: a long value used to squeeze the label until the
           value wrapped one character per line. */
        .dv-meta-label { flex: 0 0 82px; color: #475569; }
        .dv-meta-sep { flex: 0 0 8px; color: #94a3b8; }
        .dv-meta-val { flex: 1 1 auto; min-width: 0; font-weight: 700; text-transform: uppercase; word-break: break-word; }

        /* ---- piece grid ---- */
        table.dv-grid { width: 100%; border-collapse: collapse; }
        table.dv-grid th, table.dv-grid td { border: 1px solid #c7d2e3; padding: 1px 3px; font-size: 8pt; }
        /* Fixed row height: an empty cell has no line box, so a voucher with
           few pieces printed its blank rows as hairlines while the filled ones
           stayed tall — the grid stopped looking like a ruled form. */
        table.dv-grid td { height: 12px; }
        table.dv-grid th { background: #1e3a8a; color: #fff; font-weight: 700; text-align: center; letter-spacing: 0.04em; }
        table.dv-grid th:nth-child(even) { text-align: right; }
        table.dv-grid td:nth-child(odd) { text-align: center; color: #64748b; width: 22px; }
        table.dv-grid td:nth-child(even) { text-align: right; font-weight: 600; }
        .dv-grid-totals td { background: #e8eef6; font-weight: 700 !important; border-top: 2px solid #1e3a8a; }

        /* ---- totals + words ---- */
        .dv-foot { display: flex; gap: 16px; align-items: flex-start; margin-top: 10px; }
        .dv-words { flex: 1 1 auto; min-width: 0; border: 1px solid #1e3a8a; padding: 6px 9px; }
        .dv-words-label { font-size: 8pt; font-weight: 700; color: #1e3a8a; letter-spacing: 0.05em; margin-bottom: 2px; }
        .dv-words-val { font-size: 9pt; font-style: italic; color: #334155; }
        .dv-tot { flex: 0 0 46%; }
        .dv-tot-row { display: flex; justify-content: space-between; font-size: 9.5pt; padding: 3px 9px; border: 1px solid #c7d2e3; border-bottom: 0; }
        .dv-tot-row span:last-child { font-weight: 700; }
        .dv-tot-row.grand { background: #1e3a8a; color: #fff; font-weight: 700; font-size: 11pt; border: 1px solid #1e3a8a; }

        /* ---- sign-off ---- */
        .dv-thanks { text-align: center; font-size: 9.5pt; font-style: italic; color: #1e3a8a; margin: 12px 0 8px; }
        .dv-sign { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .dv-recv { flex: 1 1 auto; }
        .dv-recv-title { font-size: 8pt; font-weight: 700; color: #1e3a8a; letter-spacing: 0.05em; margin-bottom: 6px; }
        .dv-recv-line { display: flex; align-items: baseline; gap: 6px; font-size: 9pt; color: #475569; margin-bottom: 5px; }
        .dv-recv-rule { flex: 0 0 150px; border-bottom: 1px solid #94a3b8; height: 11px; }
        .dv-seal { flex: 0 0 auto; width: 82px; height: 82px; border: 2px solid #1e3a8a; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; color: #1e3a8a; text-align: center; line-height: 1.1; }
        .dv-seal b { font-size: 11pt; letter-spacing: 0.08em; }
        .dv-seal span { font-size: 5.5pt; letter-spacing: 0.08em; white-space: nowrap; }
        .dv-auth { flex: 0 0 200px; text-align: center; }
        .dv-auth-title { font-size: 8pt; font-weight: 700; color: #1e3a8a; letter-spacing: 0.05em; margin-bottom: 34px; }
        .dv-auth-rule { border-top: 1px solid #334155; margin-bottom: 4px; }
        .dv-auth-for { font-size: 8.5pt; color: #475569; }
      `}</style>

      <div className="dv-wrap">
        <div className="dv-toolbar no-print">
          <Link href="/inventory/grey-despatch-dami" className="btn btn-outline btn-sm">Back</Link>
          <PrintButton label="Print Delivery Voucher" />
        </div>

        <div className="dv-page">
          <div className="dv-stamp">
            <span>{printedAt}</span>
            <span>Page 1 of 1</span>
          </div>

          <div className="dv-head">
            <div className="dv-head-left">
              {/* Drawn, not an emoji — an emoji falls back to whatever font the
                  machine has and prints at a different size on every printer. */}
              <svg className="dv-truck" width="40" height="26" viewBox="0 0 48 30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M13 9h16v13H13z" />
                <path d="M29 13h6l4 5v4h-10z" />
                <circle cx="18" cy="24.5" r="3" />
                <circle cx="34" cy="24.5" r="3" />
                <path d="M2 11h8M0 16h10M4 21h6" />
              </svg>
              <div style={{ minWidth: 0 }}>
                <div className="dv-title">DELIVERY VOUCHER</div>
                <div className="dv-company">
                  {company?.name ?? ""}
                  {company?.address ? ` · ${company.address}` : ""}
                  {company?.phone ? ` · ${company.phone}` : ""}
                </div>
              </div>
            </div>
            <div className="dv-head-right">
              <div style={{ textAlign: "center", fontSize: "7pt", color: "#64748b" }}>
                <QrImage value="https://wa.me/923232201515" size={48} />
                <div style={{ marginTop: 1, fontWeight: 700 }}>WhatsApp Us</div>
              </div>
              <img src="/sk-logo.png" alt={company?.name ?? "Logo"} style={{ height: 52, objectFit: "contain" }} />
            </div>
          </div>
          <hr className="dv-rule" />
          <div className="dv-tagline">Thank you for your order!</div>

          <div className="dv-band">
            <div className="dv-band-left">
              <div className="dv-chip">DELIVER TO</div>
              {deliverTo.length > 0 ? (
                deliverTo.map((line, i) => (
                  <div className="dv-to-row" key={i}>
                    <ToIcon kind={line.icon} />
                    <span className={`dv-to-val${i === 0 ? " name" : ""}`}>{line.text}</span>
                  </div>
                ))
              ) : (
                <div className="dv-to-val" style={{ color: "#94a3b8" }}>—</div>
              )}
            </div>
            <div className="dv-band-right">
              {meta.map(([label, value]) => (
                <div className="dv-meta-row" key={label}>
                  <span className="dv-meta-label">{label}</span>
                  <span className="dv-meta-sep">:</span>
                  <span className="dv-meta-val">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <table className="dv-grid">
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
              {gridRows.length > 0 ? gridRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <React.Fragment key={cIdx}>
                      <td>{cell.sNo ?? ""}</td>
                      <td>{cell.mtrs != null ? formatNum(cell.mtrs) : ""}</td>
                    </React.Fragment>
                  ))}
                </tr>
              )) : (
                <tr><td colSpan={COLS * 2} style={{ textAlign: "center", padding: "20px" }}>No piece entries recorded.</td></tr>
              )}
              {gridRows.length > 0 && (
                <tr className="dv-grid-totals">
                  {colTotals.map((t, c) => (
                    <React.Fragment key={c}>
                      <td></td><td>{t > 0 ? formatNum(t) : ""}</td>
                    </React.Fragment>
                  ))}
                </tr>
              )}
            </tbody>
          </table>

          <div className="dv-foot">
            <div className="dv-words">
              <div className="dv-words-label">AMOUNT IN WORDS:</div>
              <div className="dv-words-val">{words || "—"}</div>
            </div>
            <div className="dv-tot">
              <div className="dv-tot-row"><span>THAN</span><span>{formatNum(totalThan)}</span></div>
              <div className="dv-tot-row grand"><span>METERS TOTAL</span><span>{formatNum(totalMtrs)}</span></div>
            </div>
          </div>

          <div className="dv-thanks">We appreciate your business!</div>

          <div className="dv-sign">
            <div className="dv-recv">
              <div className="dv-recv-title">RECEIVED IN GOOD CONDITION</div>
              <div className="dv-recv-line"><span style={{ flex: "0 0 60px" }}>Name</span><span className="dv-recv-rule" /></div>
              <div className="dv-recv-line"><span style={{ flex: "0 0 60px" }}>Signature</span><span className="dv-recv-rule" /></div>
              <div className="dv-recv-line"><span style={{ flex: "0 0 60px" }}>Date</span><span className="dv-recv-rule" /></div>
            </div>
            <div className="dv-seal">
              <span>DESPATCHED</span>
              <b>SK</b>
              <span>GREY CLOTH</span>
            </div>
            <div className="dv-auth">
              <div className="dv-auth-title">AUTHORIZED SIGNATURE</div>
              <div className="dv-auth-rule" />
              <div className="dv-auth-for">for {company?.name ?? ""}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
