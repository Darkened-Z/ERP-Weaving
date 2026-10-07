
"use client";
import { useEffect } from "react";

export function PasswordGuard({
  formId,
  passwordFieldName = "save_password",
  checkAction
}: {
  formId: string;
  passwordFieldName?: string;
  checkAction: (pass: string) => Promise<boolean>;
}) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const onSubmit = async (e: SubmitEvent) => {
      if (form.dataset.passwordVerified === "1") {
         form.dataset.passwordVerified = "0"; // reset
         return; // let it submit
      }
      
      const passEl = form.querySelector(`[name="${passwordFieldName}"]`) as HTMLInputElement | null;
      if (!passEl) return;
      
      const pass = passEl.value || "";
      if (!pass) return; // let server handle missing pass

      // Prevent immediate submission
      e.preventDefault();
      e.stopImmediatePropagation();
      
      try {
        const ok = await checkAction(pass);
        if (!ok) {
           let box = document.getElementById("pwd-guard-msg");
           if (!box) {
             box = document.createElement("div");
             box.id = "pwd-guard-msg";
             box.className = "border-2 px-4 py-2 mb-4 text-[12px] font-semibold mono";
             box.style.borderColor = "var(--danger)";
             box.style.color = "var(--danger)";
             form.parentElement?.insertBefore(box, form);
           }
           box.textContent = "Incorrect password. Nothing was sent — what you typed is still here.";
           box.scrollIntoView({ block: "center", behavior: "smooth" });
           passEl.focus();
           return;
        }
        
        // Success! Remove error and submit for real
        document.getElementById("pwd-guard-msg")?.remove();
        form.dataset.passwordVerified = "1";
        
        const btn = (e.submitter || form.querySelector("button[type=submit]")) as HTMLButtonElement | null;
        if (btn && form.requestSubmit) {
           form.requestSubmit(btn);
        } else {
           form.submit();
        }
      } catch (err) {
        console.error("Password check failed", err);
      }
    };
    
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [formId, passwordFieldName, checkAction]);

  return null;
}

