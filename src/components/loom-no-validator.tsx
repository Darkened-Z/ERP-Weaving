"use client";

import { useEffect, useState } from "react";

/**
 * Inline validation for the Loom No field, scoped to (shed, loom_no).
 * loom_no is unique WITHIN a shed — same number can exist in another shed.
 * - Warns immediately when the operator types a number already taken by
 *   another loom in the same shed (excluding the current row on edit).
 * - Also revalidates when the shed dropdown changes.
 * - Clears the stale ?error=dup banner as soon as the operator starts
 *   editing any field, so an old failed-save banner doesn't linger.
 */
export function LoomNoValidator({
  takenByShedLoom,
  currentId,
}: {
  takenByShedLoom: Record<string, number>; // "shed|loom_no" -> loom.id
  currentId?: number;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const input = document.querySelector('input[name="loom_no"]') as HTMLInputElement | null;
    const shedSel = document.querySelector('[name="shed"]') as HTMLSelectElement | HTMLInputElement | null;
    if (!input) return;

    const validate = () => {
      const loomV = input.value.trim();
      const shedV = (shedSel?.value ?? "").trim();
      if (!loomV || !shedV) return setMsg(null);
      const key = `${shedV}|${loomV}`;
      const takenId = takenByShedLoom[key];
      if (takenId != null && takenId !== currentId) {
        setMsg(`Loom #${loomV} in Shed ${shedV} is already used (id ${takenId}). Pick a different number.`);
      } else {
        setMsg(null);
      }
    };
    const onEditAnywhere = () => {
      // Strip ?error=... from URL without navigation so a stale banner clears
      const url = new URL(window.location.href);
      if (url.searchParams.has("error")) {
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.toString());
        // Also hide the banner inline
        document.querySelectorAll<HTMLElement>('[data-role="loom-error-banner"]').forEach((el) => {
          el.style.display = "none";
        });
      }
    };

    input.addEventListener("input", validate);
    shedSel?.addEventListener("change", validate);
    shedSel?.addEventListener("input", validate);
    document.addEventListener("input", onEditAnywhere, true);
    validate();
    return () => {
      input.removeEventListener("input", validate);
      shedSel?.removeEventListener("change", validate);
      shedSel?.removeEventListener("input", validate);
      document.removeEventListener("input", onEditAnywhere, true);
    };
  }, [takenByShedLoom, currentId]);

  if (!msg) return null;
  return (
    <div className="text-[11px] text-[var(--danger)] font-semibold mt-1 mono">
      ⚠ {msg}
    </div>
  );
}
