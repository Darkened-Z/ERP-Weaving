// Each cheque leg of an ADV issue carries its OWN narration, so the bank-advance
// ledger reads one cheque per row (owner 2026-11-17). The voucher header and the
// party's debit line keep the combined narration of every cheque.

export type IssueLeg = {
  party: string;
  bankAdv: string;
  chqNo: string;
  chqDate: string | null;
  amount: number;
  note: string | null;
};

export function legAmount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function dmy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function issueLegNarration(l: IssueLeg): string {
  return [
    "ADVANCE CHQ ISSUE",
    l.party,
    l.bankAdv,
    `CHQ #${l.chqNo}${l.chqDate ? ` DT ${dmy(l.chqDate)}` : ""}`,
    legAmount(l.amount),
    (l.note ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" — ");
}

/**
 * The operator's own note for one cheque leg, read back for the edit form.
 * Per-leg narrations are parsed directly. Vouchers saved before 2026-11-17 hold
 * the combined "#a, #b — n1; n2" text on every leg; their notes map back only
 * when there is exactly one note per cheque (or one cheque), never by guess.
 */
export function issueLegNote(
  narration: string | null,
  chqNo: string,
  amount: number,
  legIndex: number,
  legCount: number,
): string {
  const n = narration ?? "";
  const at = n.indexOf(`CHQ #${chqNo}`);
  if (at >= 0) {
    const rest = n.slice(at);
    const tag = ` — ${legAmount(amount)}`;
    const j = rest.indexOf(tag);
    if (j >= 0) {
      const after = rest.slice(j + tag.length);
      return after.startsWith(" — ") ? after.slice(3) : "";
    }
  }
  const dash = n.indexOf(" — ");
  if (!n.startsWith("ADVANCE CHQ ISSUE") || dash < 0) return "";
  const notes = n.slice(dash + 3).split("; ");
  if (legCount === 1) return notes.join("; ");
  return notes.length === legCount ? notes[legIndex] ?? "" : "";
}
