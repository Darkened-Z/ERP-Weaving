import { bankFundingThrough, chequesOnDate, type CalendarCheque } from "@/lib/advance-cheque-calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);
const BASE = "/finance/advance-cheque";

export function AdvanceChequeCalendar({ cheques, names, asOf, month, find }: {
  cheques: CalendarCheque[];
  names: Map<string, string>;
  asOf: string;
  month: string;
  find: string;
}) {
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : asOf.slice(0, 7);
  const [year, monthNo] = validMonth.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNo - 1, 1));
  const days = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const dayOfWeek = first.getUTCDay();
  const dateFor = (day: number) => `${validMonth}-${String(day).padStart(2, "0")}`;
  const weekday = (day: number) => WEEKDAYS[(dayOfWeek + day - 1) % 7];
  const linkMonth = (offset: number) => {
    const next = new Date(Date.UTC(year, monthNo - 1 + offset, 1));
    const query = new URLSearchParams({ view: "calendar", month: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}` });
    if (find) query.set("find", find);
    return `${BASE}?${query.toString()}`;
  };
  const todayFunding = bankFundingThrough(cheques, asOf);
  const monthCheques = cheques.filter((cheque) => cheque.vdate.startsWith(`${validMonth}-`) ||
    (cheque.status === "ISSUED" && cheque.chqDate.startsWith(`${validMonth}-`)));
  const visibleDays = Array.from({ length: days }, (_, i) => i + 1).filter((day) => {
    const date = dateFor(day);
    const events = chequesOnDate(cheques, date);
    return date === asOf || events.issued.length > 0 || events.due.length > 0;
  });

  const dayContent = (day: number) => {
    const date = dateFor(day);
    const events = chequesOnDate(cheques, date);
    const dueTotal = events.due.reduce((sum, cheque) => sum + cheque.amount, 0);
    const issuedTotal = events.issued.reduce((sum, cheque) => sum + cheque.amount, 0);
    const funding = date >= asOf && (events.due.length > 0 || date === asOf)
      ? bankFundingThrough(cheques, date)
      : [];
    return <>
      <div className="flex justify-between gap-1 text-[12px] font-bold"><span>{day}</span><span className="uppercase text-[10px] text-[var(--muted)]">{weekday(day)}</span></div>
      {events.due.length > 0 && <div className="mt-1 text-[10px]">
        <strong className="text-red-700">Cheque date · {fmt(dueTotal)}</strong>
        <div>{events.due.length} uncleared cheque{events.due.length === 1 ? "" : "s"}</div>
        {events.due.map((cheque) => <a key={`${cheque.issueId}-${cheque.chqNo}`} href={`${BASE}?find=${encodeURIComponent(cheque.chqNo)}`} className="block underline break-words" title={names.get(cheque.bankAdv) ?? cheque.bankAdv}>
          #{cheque.chqNo} · {names.get(cheque.bankAdv) ?? cheque.bankAdv} · {fmt(cheque.amount)}
        </a>)}
      </div>}
      {funding.length > 0 && <div className="mt-1 border-t pt-1 text-[10px]">
        <strong>Bank cover needed by this date</strong>
        {funding.map((bank) => <div key={bank.bankAdv} className="break-words">
          {names.get(bank.bankAdv) ?? bank.bankAdv}: <b className="mono">{fmt(bank.amount)}</b>
        </div>)}
      </div>}
      {events.issued.length > 0 && <div className="mt-1 border-t pt-1 text-[10px]">
        <strong className="text-blue-800">Issued · {fmt(issuedTotal)}</strong>
        {events.issued.map((cheque) => <a key={`${cheque.issueId}-${cheque.chqNo}`} href={`${BASE}?find=${encodeURIComponent(cheque.chqNo)}`} className="block underline break-words" title={names.get(cheque.bankAdv) ?? cheque.bankAdv}>
          #{cheque.chqNo} · {names.get(cheque.bankAdv) ?? cheque.bankAdv} · {fmt(cheque.amount)} · {cheque.status.toLowerCase()}
        </a>)}
      </div>}
    </>;
  };

  return <section id="cheque-calendar" className="mb-5">
    <div className="card p-3 flex items-center justify-between gap-3">
      <a className="btn btn-sm btn-outline" href={linkMonth(-1)} aria-label="Previous month">Previous</a>
      <div className="text-center">
        <h2 className="text-[16px] font-bold">Cheque calendar · {first.toLocaleString("en-PK", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        <p className="text-[11px] text-[var(--muted)]">{monthCheques.length} cheques with an issue or pending cheque date this month</p>
      </div>
      <a className="btn btn-sm btn-outline" href={linkMonth(1)} aria-label="Next month">Next</a>
    </div>
    <div className="card p-3 mt-2 text-[12px]">
      <strong>Bank cover needed today ({asOf})</strong>
      {todayFunding.length ? <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
        {todayFunding.map((bank) => <span key={bank.bankAdv}>{names.get(bank.bankAdv) ?? bank.bankAdv}: <b className="mono">{fmt(bank.amount)}</b></span>)}
      </div> : <p className="mt-1 text-[var(--muted)]">No dated uncleared cheques through today.</p>}
      <p className="text-[11px] text-[var(--muted)] mt-2">Cover needed sums issued, uncleared cheques up to that day, including overdue cheques. It updates after clearing or bouncing. This is a funding target, not the posted bank balance.</p>
    </div>
    <div className="card hidden sm:block overflow-x-auto mt-2">
      <div className="grid grid-cols-7 min-w-[980px]">
        {WEEKDAYS.map((label) => <div key={label} className="p-2 text-center text-[11px] font-bold uppercase border-b">{label}</div>)}
        {Array.from({ length: dayOfWeek + days }, (_, i) => {
          const day = i - dayOfWeek + 1;
          return <div key={i} className={`min-h-28 p-2 border-b border-r ${day > 0 && dateFor(day) === asOf ? "bg-blue-50" : ""}`}>
            {day > 0 && dayContent(day)}
          </div>;
        })}
      </div>
    </div>
    <div className="card sm:hidden p-3 mt-2">
      {visibleDays.length === 0 ? <p className="text-[12px] text-[var(--muted)]">No cheque activity this month.</p> :
        visibleDays.map((day) => <div key={day} className={`border-b py-2 last:border-b-0 ${dateFor(day) === asOf ? "bg-blue-50" : ""}`}>
          <div className="text-[11px] mono text-[var(--muted)] mb-1">{dateFor(day)}</div>
          {dayContent(day)}
        </div>)}
    </div>
  </section>;
}
