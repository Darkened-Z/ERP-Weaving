"use client";
import { useEffect } from "react";

// serverActions.bodySizeLimit in next.config, less room for the multipart framing.
const MAX_BODY_BYTES = 3.9 * 1048576;

function formBytes(form: HTMLFormElement) {
  let total = 0;
  for (const [, v] of new FormData(form)) total += typeof v === "string" ? v.length : v.size;
  return total;
}

export function PasswordGuard({
  formId,
  passwordFieldName = "save_password",
  checkAction,
}: {
  formId: string;
  passwordFieldName?: string;
  checkAction: (pass: string) => Promise<boolean>;
}) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const onSubmit = async (e: SubmitEvent) => {
      // If already verified, allow submission to go through
      if (form.dataset.passwordVerified === "1") {
        form.dataset.passwordVerified = "0"; // reset for next save
        return;
      }

      // If the submitter button has its own custom formaction (like markOk, clearOk, delete), bypass password guard
      const submitter = e.submitter as HTMLButtonElement | HTMLInputElement | null;
      if (submitter && submitter.hasAttribute("formaction")) {
        return;
      }

      const passEl = form.querySelector(`[name="${passwordFieldName}"]`) as HTMLInputElement | null;
      if (!passEl) return;

      const pass = (passEl.value || "").trim();

      const showError = (msg: string) => {
        let box = document.getElementById("pwd-guard-msg");
        if (!box) {
          box = document.createElement("div");
          box.id = "pwd-guard-msg";
          box.className = "border-2 px-4 py-2 mb-4 text-[12px] font-semibold mono";
          box.style.borderColor = "var(--danger)";
          box.style.color = "var(--danger)";
          form.parentElement?.insertBefore(box, form);
        }
        box.textContent = msg;
        box.scrollIntoView({ block: "center", behavior: "smooth" });
        passEl.focus();
        passEl.select();
      };

      if (!pass) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showError("Password is required to save. Nothing was sent — what you typed is still here.");
        return;
      }

      // Prevent immediate submission
      e.preventDefault();
      e.stopImmediatePropagation();

      const size = formBytes(form);
      if (size > MAX_BODY_BYTES) {
        showError(
          `Too many photos on this voucher: ${(size / 1048576).toFixed(1)} MB, the limit is 4 MB. Remove a few photos and save again. Nothing was sent — what you typed is still here.`,
        );
        return;
      }

      // Enter / Ctrl+S submit with no submitter. The fallback must be a button
      // this form owns — a Find form's Go button can sit inside its markup.
      const btn = (submitter ||
        Array.from(form.elements).find(
          (el) => el instanceof HTMLButtonElement && el.type === "submit" && !el.hasAttribute("formaction"),
        ) ||
        null) as HTMLButtonElement | null;
      const originalText = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Verifying...";
      }

      try {
        const ok = await checkAction(pass);
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }

        if (!ok) {
          showError("Incorrect password. Nothing was sent — what you typed is still here.");
          return;
        }

        // Success! Remove error and submit for real
        document.getElementById("pwd-guard-msg")?.remove();
        form.dataset.passwordVerified = "1";

        if (btn && form.requestSubmit) {
          form.requestSubmit(btn);
        } else {
          form.submit();
        }
      } catch (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }
        console.error("Password check failed", err);
      }
    };

    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formId, passwordFieldName, checkAction]);

  return null;
}