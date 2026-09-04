/**
 * Shared form-data parsing + voucher-number helpers, used by every voucher /
 * master page's server action. One definition instead of a copy per page —
 * import these rather than re-declaring them in a new page.
 */

/** Numeric form field → number, or null when blank / not a number. */
export const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

/** Integer form field → int, or null when blank / not a number. */
export const intVal = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v as string, 10);
  return Number.isFinite(n) ? n : null;
};

/** Text form field → trimmed string, or null when blank. */
export const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

/** Next "<prefix>-NNNN" voucher number from the existing rows' vNo values. */
export function nextVNoFromRows(rows: { vNo: string }[], prefix: string): string {
  const nums = rows
    .map((r) => {
      const m = r.vNo?.match(new RegExp("^" + prefix + "-(\\d+)$"));
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + "-" + String(next).padStart(4, "0");
}
