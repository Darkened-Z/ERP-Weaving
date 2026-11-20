import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { numberToWords } from "@/lib/number-to-words";

const dmy = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso ?? "");
const money = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

/**
 * Payment receipt: the slip the payee signs when they take the payment.
 * One payment line per receipt (?sr=n), or every line of the voucher. Each
 * receipt prints twice on the page — the payee keeps one, the office keeps the
 * signed one. Payment lines are the DEBIT lines below the contra block
 * (CP: srno < 50, BP: srno < 100).
 */
export async function PaymentReceipt({
  vtype, title, base, maxSrno, p,
}: { vtype: "CP" | "BP"; title: string; base: string; maxSrno: number; p: { id?: string; sr?: string } }) {
  const id = Number(p.id);
  if (!Number.isInteger(id)) notFound();
  const [head] = await db.select().from(schema.transMain).where(and(eq(schema.transMain.id, id), eq(schema.transMain.vtype, vtype)));
  if (!head) notFound();

  const sr = p.sr && /^\d+$/.test(p.sr) ? Number(p.sr) : null;
  const lines = (await db.select().from(schema.transDetail)
    .where(and(eq(schema.transDetail.fyCode, head.fyCode), eq(schema.transDetail.vtype, vtype), eq(schema.transDetail.vno, head.vno), lt(schema.transDetail.srno, maxSrno), gt(schema.transDetail.debit, 0)))
    .orderBy(asc(schema.transDetail.srno)))
    .filter((l) => sr == null || l.srno === sr);
  if (!lines.length) notFound();

  const [company] = await db.select().from(schema.companyProfile).limit(1);
  const accounts = await db.select({ code: schema.chartOfAccounts.code, name: schema.chartOfAccounts.description }).from(schema.chartOfAccounts);
  const accName = new Map(accounts.map((a) => [a.code, a.name ?? ""]));

  const Slip = ({ l, copy }: { l: (typeof lines)[number]; copy: string }) => (
    <div className="slip">
      <div className="top">
        <div>
          <div className="co">{company?.name ?? ""}</div>
          <div className="meta">{[company?.address, company?.city].filter(Boolean).join(", ")}{company?.phone ? ` · ${company.phone}` : ""}</div>
        </div>
        <div className="copy">{copy}</div>
      </div>
      <div className="title">{title}</div>
      <div className="grid">
        <div><span>Receipt No</span><b>{vtype}-{head.vno}/{l.srno}</b></div>
        <div><span>Date</span><b>{dmy(head.vdate)}{head.vtime ? ` ${head.vtime}` : ""}</b></div>
        <div className="wide"><span>Paid to</span><b>{accName.get(l.accCode) || l.accCode}</b><em>{l.accCode}</em></div>
        <div className="wide"><span>Amount</span><b className="amt">Rs. {money(l.debit ?? 0)}/-</b></div>
        <div className="wide"><span>In words</span><b>{numberToWords(l.debit ?? 0)}</b></div>
        {l.partyCode && <div className="wide"><span>Paid from</span><b>{accName.get(l.partyCode) || l.partyCode}</b></div>}
        <div className="wide"><span>For</span><b>{l.narration || head.narration || "—"}</b></div>
        {l.chqNo && <div className="wide"><span>Cheque</span><b>#{l.chqNo}{l.chqDate ? ` dated ${dmy(l.chqDate)}` : ""}</b></div>}
      </div>
      <div className="signs">
        <div><i />Received by (signature)</div>
        <div><i />Name / CNIC</div>
        <div><i />Paid by</div>
        <div><i />Approved by</div>
      </div>
      <div className="foot">FY {head.fyCode} · Voucher {vtype} #{head.vno}</div>
    </div>
  );

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .rc-wrap { padding: 0 !important; background: #fff !important; }
          .sheet { border: none !important; margin: 0 !important; box-shadow: none !important; }
        }
        .rc-wrap { background: #f2f2f2; min-height: 100vh; padding: 24px 16px; font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; }
        .bar { max-width: 190mm; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 13px; }
        .sheet { background: #fff; max-width: 190mm; margin: 0 auto 16px; border: 1px solid #000; page-break-after: always; break-after: page; }
        .sheet:last-child { page-break-after: auto; break-after: auto; }
        .slip { padding: 9mm 10mm 7mm; height: 132mm; box-sizing: border-box; display: flex; flex-direction: column; }
        .cut { border-top: 1px dashed #000; position: relative; height: 0; }
        .cut::after { content: "cut here"; position: absolute; left: 50%; top: -7px; transform: translateX(-50%); background: #fff; padding: 0 8px; font-size: 8pt; letter-spacing: .2em; text-transform: uppercase; }
        .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .co { font-size: 17pt; font-weight: 700; letter-spacing: .01em; }
        .meta { font-size: 8.5pt; margin-top: 2px; }
        .copy { font-size: 8pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; border: 1px solid #000; padding: 3px 8px; white-space: nowrap; }
        .title { margin: 10px 0 12px; padding: 5px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; text-align: center; font-weight: 700; letter-spacing: .3em; font-size: 12pt; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 10.5pt; }
        .grid > div { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px dotted #000; padding: 4px 0; min-width: 0; }
        .grid .wide { grid-column: 1 / -1; }
        .grid span { font-size: 7.5pt; letter-spacing: .14em; text-transform: uppercase; width: 78px; flex: none; }
        .grid b { font-weight: 600; flex: 1; }
        .grid em { font-style: normal; font-family: monospace; font-size: 8.5pt; }
        .grid .amt { font-size: 14pt; font-weight: 700; font-family: monospace; }
        .signs { margin-top: auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase; text-align: center; }
        .signs i { display: block; border-top: 1px solid #000; margin-bottom: 4px; height: 0; }
        .foot { margin-top: 8px; font-size: 7.5pt; text-align: right; color: #444; }
      `}</style>
      <div className="rc-wrap">
        <div className="bar no-print">
          <a href={`${base}?id=${head.id}`} className="btn btn-outline btn-sm">Back to {vtype} #{head.vno}</a>
          <span>{lines.length} receipt{lines.length !== 1 ? "s" : ""}</span>
          <PrintButton label="Print Receipt" />
        </div>
        {lines.map((l) => (
          <div key={l.id} className="sheet">
            <Slip l={l} copy="Payee copy" />
            <div className="cut" />
            <Slip l={l} copy="Office copy" />
          </div>
        ))}
      </div>
    </>
  );
}
