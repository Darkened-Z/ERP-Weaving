// Asia/Karachi (PKT, UTC+5) is the mill's local time. Use these helpers for
// every "today" and "now-time" call in save actions or defaults — never
// new Date().toISOString().slice(...) which returns UTC and misdates
// vouchers between midnight and 05:00 PKT.

const TZ = "Asia/Karachi";

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

/** YYYY-MM-DD in Asia/Karachi (mill local). Use for vDate defaults. */
export function today(): string {
  return dateFmt.format(new Date());
}

/** HH:MM (24h) in Asia/Karachi. Use for vtime defaults. */
export function nowTime(): string {
  return timeFmt.format(new Date());
}

/** Karachi-local YYYY-MM-DD for an arbitrary Date. */
export function toKarachiDate(d: Date): string {
  return dateFmt.format(d);
}

/** Add n days to a Karachi-local YYYY-MM-DD string; returns YYYY-MM-DD. */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** N months ago from today, YYYY-MM-DD in Karachi local. */
export function monthsAgo(n: number): string {
  const now = new Date();
  const s = dateFmt.format(now);
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - n, d));
  return dateFmt.format(dt);
}
