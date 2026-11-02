export type AgingEntry = {
  vtype: string;
  vno: number;
  vdate: string;
  dueDate: string;
  narration: string;
  amount: number;
};

export type AgingOpenItem = AgingEntry & {
  originalAmount: number;
  accum: number;
};

export function agingDueDate(purchaseDate: string, term: string | null | undefined, sourceDueDate: string | null | undefined, ledgerDueDate: string | null | undefined) {
  if (sourceDueDate) return sourceDueDate;
  if (ledgerDueDate) return ledgerDueDate;
  return term?.toUpperCase() === "CASH" ? purchaseDate : "";
}

/** Apply settlements to the oldest charges so the report shows only unpaid items. */
export function agingOpenItems(entries: AgingEntry[]) {
  const sorted = [...entries].sort((a, b) =>
    a.vdate.localeCompare(b.vdate) || a.vtype.localeCompare(b.vtype) || a.vno - b.vno,
  );
  const charges: (AgingEntry & { remainingCents: number; originalAmount: number })[] = [];
  let advanceCents = 0;
  let closingCents = 0;

  for (const entry of sorted) {
    const cents = Math.round(entry.amount * 100);
    closingCents += cents;
    if (cents > 0) {
      const appliedAdvance = Math.min(cents, advanceCents);
      advanceCents -= appliedAdvance;
      charges.push({ ...entry, originalAmount: cents / 100, remainingCents: cents - appliedAdvance });
    } else if (cents < 0) {
      let settlement = -cents;
      for (const charge of charges) {
        if (settlement === 0) break;
        const applied = Math.min(charge.remainingCents, settlement);
        charge.remainingCents -= applied;
        settlement -= applied;
      }
      advanceCents += settlement;
    }
  }

  let accumCents = 0;
  const items: AgingOpenItem[] = charges
    .filter((charge) => charge.remainingCents > 0)
    .map(({ remainingCents, originalAmount, ...entry }) => {
      accumCents += remainingCents;
      return { ...entry, originalAmount, amount: remainingCents / 100, accum: accumCents / 100 };
    });
  return { items, closing: closingCents / 100, unappliedCredit: advanceCents / 100 };
}
