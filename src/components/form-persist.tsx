"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const PREFIX = "fp:";

function cacheKey(path: string, id: string) {
  return `${PREFIX}${path}${id ? `:${id}` : ""}`;
}

function collectForm(form: HTMLFormElement): Record<string, string> {
  const data: Record<string, string> = {};
  const els = form.elements;
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!el.name || el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "file") continue;
    if (el.type === "checkbox") {
      data[el.name] = (el as HTMLInputElement).checked ? "1" : "";
    } else if (el.type === "radio") {
      if ((el as HTMLInputElement).checked) data[el.name] = el.value;
    } else {
      data[el.name] = el.value;
    }
  }
  return data;
}

function restoreForm(form: HTMLFormElement, saved: Record<string, string>) {
  const els = form.elements;
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!el.name || el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "file") continue;
    if (!(el.name in saved)) continue;
    if (el.type === "checkbox") {
      (el as HTMLInputElement).checked = saved[el.name] === "1";
    } else if (el.type === "radio") {
      (el as HTMLInputElement).checked = el.value === saved[el.name];
    } else {
      el.value = saved[el.name];
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

export function FormPersist({ formSelector = "form:not([method='get'])" }: { formSelector?: string }) {
  const path = usePathname();
  const search = useSearchParams();
  const id = search.get("id") ?? "";
  const key = cacheKey(path, id);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>(formSelector);
    if (!form) return;

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, string>;
        restoreForm(form, saved);
      }
    } catch {}

    function save() {
      if (!form) return;
      try {
        localStorage.setItem(key, JSON.stringify(collectForm(form)));
      } catch {}
    }

    function onInput() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(save, 400);
    }

    function onSubmit() {
      try { localStorage.removeItem(key); } catch {}
    }

    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    form.addEventListener("submit", onSubmit);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      form.removeEventListener("submit", onSubmit);
    };
  }, [key, formSelector]);

  return null;
}
