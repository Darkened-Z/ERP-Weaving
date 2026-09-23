"use client";

import { useEffect } from "react";

type Rule =
  /** This field must hold a number greater than zero. */
  | { field: string; message: string }
  /** At least one of these must hold a number greater than zero. */
  | { any: string[]; message: string };

/**
 * Stop a form reaching the server when a required number is missing.
 *
 * The server checks these too and always will — but its only way to report a
 * problem is to redirect back with an error, and a redirect re-renders the form
 * from the database. On a new record that means blank: the operator fills in
 * forty fields, forgets the width, presses Save and loses the lot.
 *
 * Catching it here keeps everything they typed on screen and puts the message
 * above the form, with the offending field focused.
 */
export function GuardSubmit({ rules }: { rules: Rule[] }) {
  useEffect(() => {
    const val = (form: HTMLFormElement, name: string) => {
      const el = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
      const n = Number((el?.value ?? "").trim());
      return { el, ok: Number.isFinite(n) && n > 0 };
    };

    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;

      for (const rule of rules) {
        const names = "any" in rule ? rule.any : [rule.field];
        // A rule whose fields are not on this form is not this form's rule.
        const present = names.filter((n) => form.querySelector(`[name="${n}"]`));
        if (present.length === 0) continue;
        if (present.some((n) => val(form, n).ok)) continue;

        e.preventDefault();
        e.stopPropagation();
        const first = val(form, present[0]).el;
        first?.focus();
        first?.scrollIntoView({ block: "center", behavior: "smooth" });

        let box = document.getElementById("guard-submit-msg");
        if (!box) {
          box = document.createElement("div");
          box.id = "guard-submit-msg";
          box.className =
            "border-2 px-4 py-2 mb-4 text-[12px] font-semibold mono";
          box.style.borderColor = "var(--danger)";
          box.style.color = "var(--danger)";
          form.parentElement?.insertBefore(box, form);
        }
        box.textContent = `${rule.message} Nothing was sent — what you typed is still here.`;
        box.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      document.getElementById("guard-submit-msg")?.remove();
    };

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, [rules]);

  return null;
}
