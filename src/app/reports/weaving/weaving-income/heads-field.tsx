"use client";

import { useEffect, useRef, useState } from "react";
import { AccountPicker } from "@/components/account-picker";

type Opt = { code: string; description: string; level: number };

/**
 * Several chart-of-accounts heads picked from the F9 tree popup. Each pick is
 * added as a chip and the report reloads; × drops a head. The picker writes
 * into a form-less sink input, so only the chosen codes are submitted.
 */
export function HeadsField({ name, values, options, label }: { name: string; values: string[]; options: Opt[]; label: string }) {
  const [codes, setCodes] = useState(values);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sinkRef = useRef<HTMLInputElement>(null);
  const submitNext = useRef(false);
  const sink = `${name}_pick`;
  const nameOf = (c: string) => options.find((o) => o.code === c)?.description ?? "";

  useEffect(() => {
    const el = sinkRef.current;
    if (!el) return;
    const onChange = () => {
      const v = el.value.trim();
      el.value = "";
      if (!v) return;
      submitNext.current = true;
      setCodes((c) => (c.includes(v) ? [...c] : [...c, v]));
    };
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!submitNext.current) return;
    submitNext.current = false;
    wrapRef.current?.closest("form")?.requestSubmit();
  }, [codes]);

  const drop = (c: string) => {
    submitNext.current = true;
    setCodes((x) => x.filter((y) => y !== c));
  };

  return (
    <div ref={wrapRef} data-picker-target={sink}>
      {codes.map((c) => (
        <input key={c} type="hidden" name={name} value={c} />
      ))}
      <input ref={sinkRef} type="hidden" name={sink} form="__no_form" />
      <div className="flex flex-wrap gap-1.5 items-center">
        {codes.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 border border-black px-2 py-1 text-[12px]">
            <span className="mono">{c}</span>
            <span className="text-[var(--muted)]">{nameOf(c)}</span>
            <button type="button" onClick={() => drop(c)} className="ml-1 font-bold leading-none" title="Remove">
              ×
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--muted)]">
          {codes.length === 0 ? "None — " : ""}add
          <AccountPicker targetName={sink} options={options} label={label} />
        </span>
      </div>
    </div>
  );
}
