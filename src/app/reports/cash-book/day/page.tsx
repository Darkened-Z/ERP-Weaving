import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { DateBox } from "@/components/date-box";
import { acc } from "@/lib/gl-accounts";
import { db, schema } from "@/db";
import { and, eq, lt, gte, lte, inArray } from "drizzle-orm";
import { today as todayIso } from "@/lib/time";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

/**
 * CASH BOOK — one day, one block per cash or bank account.
 *
 * The running-balance ledger answers "what has this account done since
 * January". The question actually asked at the end of a day is narrower:
 * what did we start with, what came in, what went out, what is left. So this
 * is the client's own Oracle sheet — opening at the top, receipts stacked over
 * payments, each with the account the money faced, and the closing underneath.
 */
export default async function CashBookDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  // One day or several. `date` alone still works, so old links keep opening.
  const from = p.from?.trim() || p.date?.trim() || todayIso();
  const to = p.to?.trim() || p.date?.trim() || from;

  const accounts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.code);
  const descByCode = new Map(accounts.map((a) => [a.code, a.description ?? a.code]));

  const configuredCash = await acc("CASH_IN_HAND");
  const cashBank = accounts.filter((a) => {
    if ((a.level ?? 0) < 5) return false;
    const code = a.code ?? "";
    const short = (a.descShort ?? "").toUpperCase();
    const desc = (a.description ?? "").toUpperCase();
    if (configuredCash && code === configuredCash) return true;
    if (code.startsWith("1.01.11")) return true;
    return short.includes("BANK") || desc.includes("BANK");
  });
  const codes = cashBank.map((a) => a.code);

  // Everything that moved on these accounts today, and everything before today
  // so the opening is the real one rather than a figure someone typed.
  const movements = codes.length
    ? await db
        .select({
          accCode: schema.transDetail.accCode,
          fyCode: schema.transDetail.fyCode,
          vtype: schema.transDetail.vtype,
          vno: schema.transDetail.vno,
          vdate: schema.transMain.vdate,
          img: schema.transMain.img,
          narration: schema.transDetail.narration,
          debit: schema.transDetail.debit,
          credit: schema.transDetail.credit,
        })
        .from(schema.transDetail)
        .innerJoin(
          schema.transMain,
          and(
            eq(schema.transDetail.fyCode, schema.transMain.fyCode),
            eq(schema.transDetail.vtype, schema.transMain.vtype),
            eq(schema.transDetail.vno, schema.transMain.vno),
          ),
        )
        .where(
          and(
            inArray(schema.transDetail.accCode, codes),
            gte(schema.transMain.vdate, from),
            lte(schema.transMain.vdate, to),
          ),
        )
    : [];

  const openingRows = codes.length
    ? await db
        .select({
          accCode: schema.transDetail.accCode,
          debit: schema.transDetail.debit,
          credit: schema.transDetail.credit,
        })
        .from(schema.transDetail)
        .innerJoin(
          schema.transMain,
          and(
            eq(schema.transDetail.fyCode, schema.transMain.fyCode),
            eq(schema.transDetail.vtype, schema.transMain.vtype),
            eq(schema.transDetail.vno, schema.transMain.vno),
          ),
        )
        .where(and(inArray(schema.transDetail.accCode, codes), lt(schema.transMain.vdate, from)))
    : [];
  const openingByAcc = new Map<string, number>();
  for (const r of openingRows) {
    openingByAcc.set(r.accCode, (openingByAcc.get(r.accCode) ?? 0) + (r.debit ?? 0) - (r.credit ?? 0));
  }

  // "Desc" on the client's sheet is the account the money faced — the other
  // side of the same voucher. Pull every leg of today's vouchers once.
  const voucherKeys = Array.from(new Set(movements.map((m) => `${m.fyCode}|${m.vtype}|${m.vno}`)));
  const legs = voucherKeys.length
    ? await db
        .select({
          fyCode: schema.transDetail.fyCode,
          vtype: schema.transDetail.vtype,
          vno: schema.transDetail.vno,
          accCode: schema.transDetail.accCode,
          debit: schema.transDetail.debit,
          credit: schema.transDetail.credit,
        })
        .from(schema.transDetail)
        .where(inArray(schema.transDetail.vno, Array.from(new Set(movements.map((m) => m.vno)))))
    : [];
  const contraFor = (m: (typeof movements)[number]) => {
    const mine = (m.debit ?? 0) > 0 ? "DR" : "CR";
    const others = legs.filter(
      (l) =>
        `${l.fyCode}|${l.vtype}|${l.vno}` === `${m.fyCode}|${m.vtype}|${m.vno}` &&
        l.accCode !== m.accCode &&
        ((l.debit ?? 0) > 0 ? "DR" : "CR") !== mine,
    );
    if (others.length === 0) return "";
    if (others.length === 1) return descByCode.get(others[0].accCode) ?? others[0].accCode;
    return `SPLIT — ${others.map((o) => descByCode.get(o.accCode) ?? o.accCode).join(" · ")}`;
  };

  // Walk the days in order so each one opens where the last one closed. The
  // 5th's closing is the 6th's opening, and so on — which is the whole point of
  // reading several days at once rather than re-running the report per date.
  const daysWithMovement = Array.from(new Set(movements.map((m) => m.vdate ?? ""))).filter(Boolean).sort();
  const carried = new Map(cashBank.map((a) => [a.code, openingByAcc.get(a.code) ?? 0]));

  const days = daysWithMovement.map((d) => {
    const onDay = movements.filter((m) => m.vdate === d);
    const blocks = cashBank
      .map((a) => {
        const mine = onDay.filter((m) => m.accCode === a.code);
        const receipts = mine
          .filter((m) => (m.debit ?? 0) > 0)
          .map((m) => ({ ...m, amount: m.debit ?? 0, desc: contraFor(m) }));
        const payments = mine
          .filter((m) => (m.credit ?? 0) > 0)
          .map((m) => ({ ...m, amount: m.credit ?? 0, desc: contraFor(m) }));
        const opening = carried.get(a.code) ?? 0;
        const totRec = receipts.reduce((s, r) => s + r.amount, 0);
        const totPay = payments.reduce((s, r) => s + r.amount, 0);
        const closing = opening + totRec - totPay;
        carried.set(a.code, closing);
        return {
          code: a.code,
          name: a.description ?? a.code,
          opening,
          receipts,
          payments,
          totRec,
          totPay,
          closing,
        };
      })
      // An account that did nothing on THIS day is not a block on this day,
      // even though it keeps its balance for the days that follow.
      .filter((b) => b.receipts.length || b.payments.length);
    return { date: d, blocks };
  });

  return (
    <Shell active="fin-cashbook-day">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Cash Book</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {from === to ? `For the date ${from}` : `${from} to ${to}`} &middot; {days.length} day
              {days.length === 1 ? "" : "s"} with movement
            </p>
          </div>
          <div className="no-print">
            <PrintButton label="Print" />
          </div>
        </div>

        <form method="GET" className="card p-4 mb-5 flex gap-3 items-end flex-wrap no-print">
          <div>
            <label className="label block mb-1">From</label>
            <DateBox name="from" className="input-box mono" defaultValue={from} />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <DateBox name="to" className="input-box mono" defaultValue={to} />
          </div>
          <button type="submit" className="btn btn-sm">View</button>
          <span className="text-[11px] text-[var(--muted)]">
            Each day carries its own opening and closing — the 5th closes where the 6th opens.
          </span>
        </form>

        {days.length === 0 ? (
          <div className="card px-4 py-10 text-center text-[13px] text-[var(--muted)] italic">
            No cash or bank movement {from === to ? `on ${from}` : `between ${from} and ${to}`}.
          </div>
        ) : (
          days.map((day) => (
            <div key={day.date} className="mb-8">
              <div
                className="px-3 py-1.5 mb-3 border-2 border-black font-bold text-[13px] uppercase tracking-[0.08em]"
                style={{ background: "#0f172a", color: "white" }}
              >
                For the date {day.date}
              </div>
              {day.blocks.map((b) => (
            <div key={b.code} className="card mb-6" style={{ breakInside: "avoid" }}>
              <div className="px-4 py-2 border-b-2 border-black flex flex-wrap items-baseline justify-between gap-3">
                <span className="font-bold text-[14px] uppercase tracking-[0.06em]">{b.name}</span>
                <span className="mono text-[12px]">
                  <span className="text-[var(--muted)]">Opening</span>{" "}
                  <span className="font-bold text-[14px]">{fmt(b.opening)}</span>
                </span>
              </div>

              {([
                { label: "Receipts", rows: b.receipts, total: b.totRec },
                { label: "Payments", rows: b.payments, total: b.totPay },
              ] as const).map((sec) => (
                sec.rows.length === 0 ? null : (
                <div key={sec.label} className="overflow-x-auto">
                  <table className="w-full" style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>V.No</th>
                        <th style={{ width: 44 }}>VT</th>
                        <th style={{ width: 90 }}>Date</th>
                        <th style={{ width: 230 }}>Desc</th>
                        <th>Narration</th>
                        <th className="text-center no-print" style={{ width: 44 }}>Im</th>
                        <th className="text-right" style={{ width: 120 }}>{sec.label}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((r, i) => (
                        <tr key={`${r.vtype}-${r.vno}-${i}`}>
                          <td className="mono font-bold">{r.vno}</td>
                          <td className="mono">{r.vtype}</td>
                          <td className="mono text-[12px]">{r.vdate}</td>
                          <td className="text-[12px]">{r.desc}</td>
                          <td className="text-[12px]">{(r.narration ?? "").trim()}</td>
                          <td className="text-center no-print">
                            {r.img ? (
                              <a href={r.img} target="_blank" rel="noreferrer" className="text-[11px] underline">
                                Im
                              </a>
                            ) : (
                              <span className="text-[11px] text-[var(--muted)]">—</span>
                            )}
                          </td>
                          <td className="mono text-right">{fmt(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-black">
                        <td colSpan={5} className="font-bold text-[12px] uppercase tracking-[0.05em]">
                          Total {sec.label}
                        </td>
                        <td className="no-print"></td>
                        <td className="mono text-right font-bold">{fmt(sec.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                )
              ))}

              <div className="px-4 py-2 border-t-2 border-black flex justify-between items-baseline">
                <span className="font-bold text-[12px] uppercase tracking-[0.06em]">Closing Balance</span>
                <span className="mono text-[16px] font-bold">{fmt(b.closing)}</span>
              </div>
            </div>
              ))}
            </div>
          ))
        )}
      </div>
    </Shell>
  );
}
