"use client";

import { useEffect, useState } from "react";

/**
 * Client-side validation for the Grey Conversion Contract form. The server
 * rejects saves with missing rate/read/pick/width — but the redirect wiped
 * everything the operator had typed (owner complaint). This guard checks the
 * same rules BEFORE submit: an invalid save stays on the page with a banner
 * listing what is missing, so no typed data is ever lost.
 */
export function ConversionContractGuard({ formId }: { formId: string }) {
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    const onSubmit = (e: Event) => {
      const q = (name: string) =>
        parseFloat((form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "").trim()) || 0;
      const s = (name: string) =>
        (form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? "").trim();
      const errs: string[] = [];
      if (!s("party")) errs.push("Party is required.");
      if (!(q("rate_per_pick") > 0 || q("rate_mtr") > 0))
        errs.push("Either Rate Per Pick or Rate/Mtr must be greater than 0.");
      if (!(q("read") > 0)) errs.push("Read must be greater than 0.");
      if (!(q("pick") > 0)) errs.push("Pick must be greater than 0.");
      if (!(q("width") > 0)) errs.push("Width must be greater than 0.");
      if (errs.length) {
        e.preventDefault();
        setErrors(errs);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrors([]);
      }
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [formId]);

  if (!errors.length) return null;
  return (
    <div
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] border-2 border-[var(--danger)] bg-white px-4 py-3 shadow-lg"
      style={{ maxWidth: 560 }}
    >
      <div className="mono text-[12px] font-bold text-[var(--danger)] mb-1">
        Cannot save yet — fix these and press Save again (your entries are kept):
      </div>
      <ul className="mono text-[12px] text-[var(--danger)] list-disc pl-5">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}
