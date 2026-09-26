"use client";
import { useActionState } from "react";

export type SaveError = {
  error: string;
  than?: string;
  dv?: string;
  thru?: string;
} | null;

const msgs: Record<string, (e: SaveError) => string> = {
  code_exists: () => "Voucher number already exists. Try again.",
  period_locked: (e) =>
    `Period is locked. Cannot save vouchers for this date${e?.thru ? ` — locked through ${e.thru}` : ""}.`,
  than_locked: (e) =>
    `Than ${e?.than ?? ""} has already gone out on despatch ${e?.dv ?? ""} — it cannot be changed or removed here. Edit despatch ${e?.dv ?? ""} first if the cloth really did not leave.`,
  dup_than: () => "Duplicate mm/Than Sr No — already used by another production entry.",
  no_beam: () =>
    "At least one row must have a Beam # (fill it in BEAM DETAILS below, or pick a header Loom#).",
  party_cross: () =>
    "Party cross — every beam’s contract must belong to the same conversion party. Fix the loom/contract selection.",
  party_mismatch: () =>
    "Party mismatch — Conv Contract Party and Beam Cost Party must be the same. Check the Parties section before saving.",
  no_grade: () => "Total grade production must be greater than 0.",
};

export function SaveForm({
  action,
  formId,
  children,
}: {
  action: (prev: SaveError, fd: FormData) => Promise<SaveError>;
  formId: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  const fn = state?.error ? msgs[state.error] : null;
  const msg = fn ? fn(state) : null;
  return (
    <>
      {msg && (
        <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
          {msg}
        </div>
      )}
      <form id={formId} action={formAction}>
        {children}
      </form>
    </>
  );
}
