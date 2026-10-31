import { addDays } from "@/lib/time";

export function upcomingDays(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 1 && days <= 365 ? days : null;
}

/** Today through the selected future day, excluding settled or undated cheques. */
export function isUpcomingCheque(
  cheque: { status: string; chqDate: string },
  asOf: string,
  days: number,
): boolean {
  return cheque.status === "ISSUED" && !!cheque.chqDate &&
    cheque.chqDate >= asOf && cheque.chqDate <= addDays(asOf, days);
}
