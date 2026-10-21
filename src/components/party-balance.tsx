"use client";

import { useEffect, useState } from "react";

const fmt = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(n);

/**
 * The ledger balance of the account on the line being worked on — the Oracle
 * voucher's "Balance Amount" (owner 2026-10-22). Follows whichever line's
 * account was last focused or picked; balances come from the server.
 */
export function PartyBalance({ balances, fieldName = "line_acc" }: { balances: Record<string, number>; fieldName?: string }) {
  const [code, setCode] = useState("");

  useEffect(() => {
    const valueAt = (t: EventTarget | null): string | null => {
      const el = t as HTMLElement | null;
      if (!el) return null;
      if (el instanceof HTMLInputElement && el.name === fieldName) return el.value;
      const wrap = el.closest?.(`[data-finding-picker="${fieldName}"]`);
      return wrap?.querySelector<HTMLInputElement>(`input[name="${fieldName}"]`)?.value ?? null;
    };
    const onEvent = (e: Event) => {
      const v = valueAt(e.target)?.trim();
      if (v) setCode(v);
    };
    // An opened voucher starts on its first account.
    const first = setTimeout(() => {
      const filled = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${fieldName}"]`)).find((i) => i.value.trim());
      if (filled) setCode(filled.value.trim());
    }, 0);
    document.addEventListener("focusin", onEvent, true);
    document.addEventListener("change", onEvent, true);
    return () => {
      clearTimeout(first);
      document.removeEventListener("focusin", onEvent, true);
      document.removeEventListener("change", onEvent, true);
    };
  }, [fieldName]);

  const bal = code ? (balances[code] ?? 0) : null;
  return (
    <div className="text-right">
      <div className="label mb-1">Party Balance</div>
      <div className="input-box mono text-right font-bold whitespace-nowrap" style={{ minWidth: 160 }} title={code || "Pick an account on a line"}>
        {bal == null ? "—" : `${fmt(Math.abs(bal))} ${bal >= 0 ? "Dr" : "Cr"}`}
      </div>
      {code && <div className="text-[10px] text-[var(--muted)] mono mt-0.5">{code}</div>}
    </div>
  );
}
