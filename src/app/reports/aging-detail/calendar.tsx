type CalendarItem = {
  party: string;
  voucher: string;
  dueDate: string;
  amount: number;
};

const fmt = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AgingCalendar({ items, asOf, month, baseHref }: {
  items: CalendarItem[];
  asOf: string;
  month: string;
  baseHref: string;
}) {
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : asOf.slice(0, 7);
  const [year, monthNo] = validMonth.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNo - 1, 1));
  const days = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const link = (offset: number) => {
    const next = new Date(Date.UTC(year, monthNo - 1 + offset, 1));
    const value = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    return `${baseHref}&month=${value}`;
  };
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    if (!item.dueDate) continue;
    (byDate.get(item.dueDate) ?? byDate.set(item.dueDate, []).get(item.dueDate)!).push(item);
  }
  const before = items.filter((item) => item.dueDate && item.dueDate < `${validMonth}-01`);
  const undated = items.filter((item) => !item.dueDate);
  const inMonth = items.filter((item) => item.dueDate.startsWith(`${validMonth}-`));
  const cells = Array.from({ length: first.getUTCDay() + days }, (_, index) => {
    const day = index - first.getUTCDay() + 1;
    return day > 0 ? day : null;
  });

  return (
    <div className="space-y-4">
      <div className="card p-3 flex items-center justify-between gap-3">
        <a className="btn btn-sm" href={link(-1)} aria-label="Previous month">Previous</a>
        <div className="text-center">
          <strong className="text-[16px] block">{first.toLocaleString("en-PK", { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
          <span className="text-[11px] text-[var(--muted)]">{inMonth.length} dues · {fmt(inMonth.reduce((sum, item) => sum + item.amount, 0))}</span>
        </div>
        <a className="btn btn-sm" href={link(1)} aria-label="Next month">Next</a>
      </div>
      <div className="card hidden sm:block overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[700px]">
          {weekdays.map((label) => (
            <div key={label} className="p-2 text-center text-[11px] font-bold uppercase border-b">{label}</div>
          ))}
          {cells.map((day, index) => {
            const date = day ? `${validMonth}-${String(day).padStart(2, "0")}` : "";
            const due = byDate.get(date) ?? [];
            const total = due.reduce((sum, item) => sum + item.amount, 0);
            return (
              <div key={index} className={`min-h-28 p-2 border-b border-r ${date === asOf ? "bg-blue-50" : ""}`}>
                {day && <>
                  <div className="flex justify-between text-[12px] font-bold"><span>{day}</span><span className="text-[10px] uppercase text-[var(--muted)]">{weekdays[(first.getUTCDay() + day - 1) % 7]}</span></div>
                  {due.length > 0 && <>
                    <div className={`mono text-[12px] font-bold ${date < asOf ? "text-red-700" : "text-blue-800"}`}>{fmt(total)}</div>
                    <div className="text-[10px] text-[var(--muted)]">{due.length} open item{due.length === 1 ? "" : "s"}</div>
                    <div className="mt-1 space-y-1">
                      {due.map((item, i) => <div key={`${item.party}-${item.voucher}-${i}`} className="text-[10px] leading-tight break-words" title={`${item.party} · ${item.voucher} · ${fmt(item.amount)}`}>
                        {item.party} · {item.voucher} · {fmt(item.amount)}
                      </div>)}
                    </div>
                  </>}
                </>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="card sm:hidden p-3">
        {inMonth.length === 0 ? <p className="text-[12px] text-[var(--muted)]">No dues this month.</p> :
          Array.from(byDate.entries()).filter(([date]) => date.startsWith(`${validMonth}-`)).sort(([a], [b]) => a.localeCompare(b)).map(([date, due]) =>
            <div key={date} className="border-b py-2 last:border-b-0">
              <div className="flex justify-between font-bold text-[12px]"><span>{date} · {weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]}</span><span className="mono">{fmt(due.reduce((sum, item) => sum + item.amount, 0))}</span></div>
              {due.map((item, i) => <div key={`${item.party}-${item.voucher}-${i}`} className="flex justify-between gap-2 text-[11px] py-1">
                <span>{item.party} · {item.voucher}</span><span className="mono whitespace-nowrap">{fmt(item.amount)}</span>
              </div>)}
            </div>,
          )}
      </div>
      {(before.length > 0 || undated.length > 0) && <div className="grid gap-4 md:grid-cols-2">
        {[
          { title: "Due before this month", list: before },
          { title: "No due date recorded", list: undated },
        ].map(({ title, list }) => list.length > 0 && <div key={title} className="card p-3">
          <h2 className="font-bold text-[13px] mb-2">{title} · {fmt(list.reduce((sum, item) => sum + item.amount, 0))}</h2>
          <div className="space-y-1 max-h-64 overflow-auto">
            {list.map((item, i) => <div key={`${item.party}-${item.voucher}-${i}`} className="flex justify-between gap-3 text-[12px] border-t py-1">
              <span>{item.dueDate ? `${item.dueDate} · ` : ""}{item.party} · {item.voucher}</span>
              <strong className="mono whitespace-nowrap">{fmt(item.amount)}</strong>
            </div>)}
          </div>
        </div>)}
      </div>}
    </div>
  );
}
