export type AdvanceLedgerLine = {
  fyCode: string;
  vno: number;
  srno: number;
  accCode: string;
  chqNo: string | null;
  chqDate: string | null;
  trnType: string | null;
  debit: number;
  credit: number;
};

export type PendingAdvanceCheque = { chqNo: string; chqDate: string | null; amount: number };

/** Reconcile each issued cheque against its clear/bounce entries in voucher order. */
export function pendingAdvanceCheques(lines: AdvanceLedgerLine[]): PendingAdvanceCheque[] {
  const byCheque = new Map<string, AdvanceLedgerLine[]>();
  for (const line of lines) {
    const no = (line.chqNo ?? "").trim();
    if (!no) continue;
    const key = `${line.fyCode}|${line.accCode}|${no}`;
    (byCheque.get(key) ?? byCheque.set(key, []).get(key)!).push(line);
  }
  const open: PendingAdvanceCheque[] = [];
  for (const group of byCheque.values()) {
    const ordered = group.sort((a, b) => a.vno - b.vno || a.srno - b.srno);
    const issued: PendingAdvanceCheque[] = [];
    for (const line of ordered) {
      if (line.trnType === "ISSUE" && line.credit > 0) {
        issued.push({ chqNo: (line.chqNo ?? "").trim(), chqDate: line.chqDate || null, amount: line.credit });
      } else if ((line.trnType === "CLEAR" || line.trnType === "BOUNCE") && line.debit > 0) {
        let toSettle = line.debit;
        for (const item of issued) {
          const paid = Math.min(item.amount, toSettle);
          item.amount -= paid;
          toSettle -= paid;
          if (toSettle <= 0.005) break;
        }
      }
    }
    open.push(...issued.filter((item) => item.amount > 0.005));
  }
  return open;
}
