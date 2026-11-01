export type ChequeTransitionRow = {
  id: number;
  fyCode: string;
  vno: number;
  vdate: string;
  trnType: string | null;
  accCode: string;
  debit: number;
};

/** Find the bounce for one issue without touching a later re-issue. */
export function bounceToUndo(
  rows: ChequeTransitionRow[],
  issue: { id: number; fyCode: string; bankAdv: string },
): { status: "not_bounced" | "reissued"; bounce: null } | { status: "ready"; bounce: ChequeTransitionRow } {
  const nextIssueId = Math.min(
    ...rows.filter((row) => row.trnType === "ISSUE" && row.id > issue.id).map((row) => row.id),
    Number.POSITIVE_INFINITY,
  );
  const bounce = rows
    .filter((row) =>
      row.trnType === "BOUNCE" && row.fyCode === issue.fyCode &&
      row.id > issue.id && row.id < nextIssueId &&
      row.accCode === issue.bankAdv && row.debit > 0,
    )
    .sort((a, b) => b.id - a.id)[0];
  if (!bounce) return { status: "not_bounced", bounce: null };
  if (Number.isFinite(nextIssueId)) return { status: "reissued", bounce: null };
  return { status: "ready", bounce };
}
