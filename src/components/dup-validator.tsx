"use client";

import { useEffect, useState } from "react";

/**
 * Inline duplicate-value validator. Watches an input by name and warns
 * immediately when the typed value already exists in `taken` (excluding
 * the currently-edited id, if any).
 *
 * Renders nothing when the value is valid or empty. Renders a small red
 * hint under the input on collision.
 */
export function DupValidator({
  inputName,
  taken,
  selfId,
  label = "Already exists",
  caseInsensitive = true,
}: {
  inputName: string;
  taken: Array<{ id: number | string; value: string }>;
  selfId?: number | string | null;
  label?: string;
  caseInsensitive?: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>(`input[name="${inputName}"]`);
    if (!el) return;
    const norm = (s: string) => (caseInsensitive ? s.trim().toLowerCase() : s.trim());
    const check = () => {
      const v = norm(el.value ?? "");
      if (!v) return setMsg(null);
      const hit = taken.find((t) => norm(t.value) === v && (selfId == null || String(t.id) !== String(selfId)));
      setMsg(hit ? `${label} (id ${hit.id})` : null);
    };
    check();
    el.addEventListener("input", check);
    el.addEventListener("change", check);
    return () => {
      el.removeEventListener("input", check);
      el.removeEventListener("change", check);
    };
  }, [inputName, taken, selfId, label, caseInsensitive]);

  if (!msg) return null;
  return (
    <div className="mono text-[11px] font-bold" style={{ color: "var(--danger)" }}>
      ⚠ {msg}
    </div>
  );
}
