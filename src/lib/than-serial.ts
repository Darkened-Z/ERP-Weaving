/**
 * The suffix that makes a than serial unique inside its voucher: the counts-grid
 * row's own position, NOT its quality grade. Row 1 is `/A`, row 2 `/B`, and so on
 * — two A-grade thans in one voucher are still `/A` and `/B`, which is what keeps
 * them separable downstream (grey despatch picks and delivers one than at a time).
 * Past row Z the letters run out and the position is used as-is.
 *
 * Server (saveAction) and client (ThanSerialLive) MUST agree, so both call this.
 */
export function thanLetter(rowIndex: number): string {
  return rowIndex < 26 ? String.fromCharCode(65 + rowIndex) : String(rowIndex + 1);
}
