// Pure date maths for task repeats and reminders. No db, so it is unit-tested.

export type RepeatRule = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "PERIODICALLY" | "CUSTOM";

export const REPEAT_RULES: { value: RepeatRule; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
  { value: "PERIODICALLY", label: "Periodically" },
  { value: "CUSTOM", label: "Custom" },
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type RepeatUnit = "WEEK" | "MONTH";

export type Repeat = {
  rule: RepeatRule;
  /** PERIODICALLY: every N days. CUSTOM: every N weeks / months. */
  every?: number | null;
  /** CUSTOM only: what `every` counts. */
  unit?: RepeatUnit | null;
  /** WEEKLY / CUSTOM-weeks: weekday numbers 0 (Sun) … 6 (Sat). Empty = the start date's weekday. */
  days?: number[];
  /** MONTHLY / CUSTOM-months: dates of the month 1 … 31, 0 = last day. Empty = the start date's date. */
  dates?: number[];
  /** Last date an occurrence may fall on (inclusive). */
  end?: string | null;
};

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

function addDaysIso(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Same day-of-month `months` later, clamped to the month's last day (31 Jan → 28/29 Feb). */
function addMonthsClamped(anchor: string, months: number): string {
  const a = parse(anchor);
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m, Math.min(a.getUTCDate(), last))));
}

function parseList(s: string | null | undefined, min: number, max: number): number[] {
  return Array.from(new Set((s ?? "").split(",").filter((x) => x.trim() !== "").map((x) => parseInt(x, 10)).filter((n) => n >= min && n <= max))).sort((a, b) => a - b);
}
export const parseWeekdays = (s: string | null | undefined) => parseList(s, 0, 6);
export const parseMonthDates = (s: string | null | undefined) => parseList(s, 0, 31);

/** Weekday occurrences: on the given weekdays, every `n`th week counted from the start's week (weeks begin Sunday). */
function weekdayDates(start: string, days: number[], n: number, stop: string, limit: number, out: string[]) {
  const weekOf = (iso: string) => Math.floor((parse(iso).getTime() / 86400000 + 4) / 7);
  const w0 = weekOf(start);
  for (let d = addDaysIso(start, 1); d <= stop && out.length < limit; d = addDaysIso(d, 1)) {
    if (days.includes(parse(d).getUTCDay()) && (weekOf(d) - w0) % n === 0) out.push(d);
  }
}

/** Month-date occurrences: on the given dates, every `n`th month from the start's month. 0 or a date past month end = last day. */
function monthDates(start: string, dates: number[], n: number, stop: string, limit: number, out: string[]) {
  const s = parse(start);
  for (let k = 0; out.length < limit; k += n) {
    const y = s.getUTCFullYear();
    const m = s.getUTCMonth() + k;
    const first = fmt(new Date(Date.UTC(y, m, 1)));
    if (first > stop) break;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const inMonth = Array.from(new Set(dates.map((d) => (d === 0 || d > last ? last : d)))).sort((a, b) => a - b);
    for (const d of inMonth) {
      const iso = fmt(new Date(Date.UTC(y, m, d)));
      if (iso > start && iso <= stop && out.length < limit) out.push(iso);
    }
  }
}

/**
 * Every occurrence date of a series from `start` (the first one, always
 * included — it is the task as created) through `until`, capped at `limit`.
 */
export function occurrences(start: string, r: Repeat, until: string, limit = 400): string[] {
  const stop = r.end && r.end < until ? r.end : until;
  if (start > stop) return [];
  const out: string[] = [start];
  if (r.rule === "NONE") return out;
  const startDow = parse(start).getUTCDay();
  const startDate = parse(start).getUTCDate();
  const n = Math.max(1, r.every ?? 1);
  switch (r.rule) {
    case "WEEKLY":
      weekdayDates(start, r.days?.length ? r.days : [startDow], 1, stop, limit, out);
      return out;
    case "MONTHLY":
      monthDates(start, r.dates?.length ? r.dates : [startDate], 1, stop, limit, out);
      return out;
    case "CUSTOM":
      if (r.unit === "MONTH") monthDates(start, r.dates?.length ? r.dates : [startDate], n, stop, limit, out);
      else weekdayDates(start, r.days?.length ? r.days : [startDow], n, stop, limit, out);
      return out;
  }
  for (let i = 1; out.length < limit; i++) {
    const d =
      r.rule === "DAILY" ? addDaysIso(start, i)
      : r.rule === "PERIODICALLY" ? addDaysIso(start, n * i)
      : addMonthsClamped(start, 12 * i);
    if (d > stop) break;
    out.push(d);
  }
  return out;
}

const ord = (d: number) => (d === 0 ? "last day" : `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`);

export function repeatLabel(r: Repeat): string {
  const wd = (r.days ?? []).map((d) => WEEKDAYS[d]).join(", ");
  const md = (r.dates ?? []).map(ord).join(", ");
  const n = Math.max(1, r.every ?? 1);
  switch (r.rule) {
    case "NONE": return "";
    case "DAILY": return "Daily";
    case "WEEKLY": return wd ? `Weekly · ${wd}` : "Weekly";
    case "MONTHLY": return md ? `Monthly · ${md}` : "Monthly";
    case "YEARLY": return "Yearly";
    case "PERIODICALLY": return `Every ${n} days`;
    case "CUSTOM":
      return r.unit === "MONTH"
        ? `Every ${n === 1 ? "" : `${n} `}month${n === 1 ? "" : "s"}${md ? ` · ${md}` : ""}`
        : `Every ${n === 1 ? "" : `${n} `}week${n === 1 ? "" : "s"}${wd ? ` · ${wd}` : ""}`;
  }
}

export type ReminderUnit = "minutes" | "hours" | "days";
export type ReminderTiming = "BEFORE" | "AFTER";
export type ReminderChannel = "APP" | "WHATSAPP" | "EMAIL";

export const REMINDER_CHANNELS: { value: ReminderChannel; label: string }[] = [
  { value: "APP", label: "Mobile App" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
];

const UNIT_MIN: Record<ReminderUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/**
 * When a reminder fires, as a Karachi wall-clock "YYYY-MM-DDTHH:MM" string
 * (PKT has no DST, so plain minute arithmetic is exact). A task with no start
 * time is treated as 09:00.
 */
export function reminderAt(date: string, time: string | null | undefined, amount: number, unit: ReminderUnit, timing: ReminderTiming): string {
  const [h, m] = (time && /^\d{2}:\d{2}/.test(time) ? time : "09:00").split(":").map((x) => parseInt(x, 10));
  const base = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m);
  const off = Math.max(0, amount) * UNIT_MIN[unit] * 60000 * (timing === "BEFORE" ? -1 : 1);
  return new Date(base + off).toISOString().slice(0, 16);
}

export function reminderLabel(amount: number, unit: string, timing: string): string {
  return `${amount} ${unit} ${timing === "AFTER" ? "after" : "before"}`;
}
