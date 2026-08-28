"use client";

import { useEffect, useState } from "react";

/**
 * Inline validation for the Loom No field.
 * - Warns immediately when the operator types a number already taken by
 *   another loom (excluding the current row on edit).
 * - Clears the stale ?error=dup banner as soon as the operator starts
 *   editing any field, so an old failed-save banner doesn't linger.
 */
export function LoomNoValidator({
  takenByLoomNo,
  currentId,
}: {
  takenByLoomNo: Record<string, number>; // loomNo -> loom.id
  currentId?: number;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const input = document.querySelector('input[name="loom_no"]') as HTMLInputElement | null;
    if (!input) return;

    const validate = () => {
      const v = input.value.trim();
      if (!v) return setMsg(null);
      const takenId = takenByLoomNo[v];
      if (takenId != null && takenId !== currentId) {
        setMsg(`Loom #${v} is already used by another loom (id ${takenId}). Pick a different number.`);
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
    document.addEventListener("input", onEditAnywhere, true);
    validate();
    return () => {
      input.removeEventListener("input", validate);
      document.removeEventListener("input", onEditAnywhere, true);
    };
  }, [takenByLoomNo, currentId]);

  if (!msg) return null;
  return (
    <div className="text-[11px] text-[var(--danger)] font-semibold mt-1 mono">
      ⚠ {msg}
    </div>
  );
}
