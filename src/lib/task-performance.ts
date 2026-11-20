/**
 * How a task stands against its date. The task's start date is its due date;
 * finishing on that day or earlier is on time. Dates are Karachi YYYY-MM-DD.
 */
export type Outcome = "ON_TIME" | "LATE" | "OVERDUE" | "PENDING" | "NO_DATE";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  ON_TIME: "On time",
  LATE: "Late",
  OVERDUE: "Overdue",
  PENDING: "Pending",
  NO_DATE: "No date",
};

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/** `doneOn` = Karachi date the task was finished (null while open). */
export function outcome(due: string | null, doneOn: string | null, asOf: string): { outcome: Outcome; daysLate: number } {
  if (!due) return { outcome: doneOn ? "ON_TIME" : "NO_DATE", daysLate: 0 };
  if (doneOn) {
    const late = dayDiff(doneOn, due);
    return late > 0 ? { outcome: "LATE", daysLate: late } : { outcome: "ON_TIME", daysLate: 0 };
  }
  return due < asOf ? { outcome: "OVERDUE", daysLate: dayDiff(asOf, due) } : { outcome: "PENDING", daysLate: 0 };
}

export type Score = { total: number; onTime: number; late: number; overdue: number; pending: number; noDate: number; lateDays: number; onTimePct: number | null; donePct: number | null };

/**
 * On-time % = on time ÷ every task whose date has passed (on time + late +
 * overdue): did they keep the deadline. Done % = finished ÷ the same.
 * Pending (not due yet) and undated tasks do not count against anyone.
 */
export function score(items: { outcome: Outcome; daysLate: number }[]): Score {
  const n = (o: Outcome) => items.filter((i) => i.outcome === o).length;
  const onTime = n("ON_TIME"), late = n("LATE"), overdue = n("OVERDUE");
  const due = onTime + late + overdue;
  return {
    total: items.length, onTime, late, overdue, pending: n("PENDING"), noDate: n("NO_DATE"),
    lateDays: items.filter((i) => i.outcome === "LATE").reduce((s, i) => s + i.daysLate, 0),
    onTimePct: due ? (onTime / due) * 100 : null,
    donePct: due ? ((onTime + late) / due) * 100 : null,
  };
}
