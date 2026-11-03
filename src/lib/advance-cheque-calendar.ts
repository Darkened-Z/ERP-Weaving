export type CalendarCheque = {
  issueId: number;
  vno: number;
  vdate: string;
  chqNo: string;
  chqDate: string;
  bankAdv: string;
  party: string;
  amount: number;
  status: "ISSUED" | "CLEARED" | "BOUNCED";
};

export type BankFunding = {
  bankAdv: string;
  amount: number;
  cheques: CalendarCheque[];
};

/** Minimum cover for currently uncleared cheques dated on or before this day. */
export function bankFundingThrough(cheques: CalendarCheque[], date: string): BankFunding[] {
  const banks = new Map<string, BankFunding>();
  for (const cheque of cheques) {
    if (cheque.status !== "ISSUED" || !cheque.chqDate || cheque.chqDate > date) continue;
    const bank = banks.get(cheque.bankAdv) ?? { bankAdv: cheque.bankAdv, amount: 0, cheques: [] };
    bank.amount += cheque.amount;
    bank.cheques.push(cheque);
    banks.set(cheque.bankAdv, bank);
  }
  return [...banks.values()].sort((a, b) => a.bankAdv.localeCompare(b.bankAdv));
}

export function chequesOnDate(cheques: CalendarCheque[], date: string) {
  return {
    issued: cheques.filter((cheque) => cheque.vdate === date),
    due: cheques.filter((cheque) => cheque.status === "ISSUED" && cheque.chqDate === date),
  };
}
