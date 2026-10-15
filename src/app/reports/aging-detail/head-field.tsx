"use client";

import { useEffect, useRef, useState } from "react";
import { AccountPicker } from "@/components/account-picker";

type Opt = { code: string; description: string; level: number };

/**
 * Code (Head) filter for the aging reports: the Chart-of-Accounts tree popup
 * (F9), level-4 heads only. Picking a head loads its data straight away; "All"
 * clears the head and shows every account of the side.
 */
export function HeadField({ value, options }: { value: string; options: Opt[] }) {
  const [code, setCode] = useState(value);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const nameOf = (c: string) => options.find((o) => o.code === c)?.description ?? c;

  useEffect(() => {
    const el = hiddenRef.current;
    if (!el) return;
    const onChange = () => {
      setCode(el.value);
      el.form?.requestSubmit();
    };
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);

  return (
    <div data-picker-target="code">
      <input ref={hiddenRef} type="hidden" name="code" value={code} readOnly />
      <div className="flex gap-1 items-center">
        <input
          className="input-box mono flex-1 min-w-0 bg-gray-50 cursor-pointer"
          value={code ? `${code} — ${nameOf(code)}` : "All heads"}
          readOnly
          title="Click or F9 to pick a head"
          onClick={(e) => e.currentTarget.parentElement?.querySelector<HTMLButtonElement>("button")?.click()}
        />
        <AccountPicker targetName="code" options={options} pickLevel={4} label="Select Account Head (Level 4)" />
        {code && (
          <button
            type="button"
            className="btn btn-outline btn-xs mono"
            style={{ padding: "3px 8px" }}
            title="Show every head"
            onClick={() => {
              const el = hiddenRef.current;
              if (!el) return;
              el.value = "";
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }}
          >
            All
          </button>
        )}
      </div>
    </div>
  );
}
