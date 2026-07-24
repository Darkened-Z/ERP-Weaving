"use client";

import Link from "next/link";
import { useState } from "react";

type NavItem = { href: string; label: string; key: string };
type Section = { label: string | null; items: NavItem[] };

export function SidebarNav({ sections, active }: { sections: Section[]; active?: string }) {
  const [open, setOpen] = useState<string[]>(() => {
    for (const s of sections) {
      if (s.label && s.items.some((i) => i.key === active)) return [s.label];
    }
    return [];
  });

  function toggle(label: string) {
    setOpen((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  }

  return (
    <nav className="flex-1 py-2">
      {sections.map((section, si) => {
        if (!section.label) {
          return (
            <div key={si}>
              {section.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`block px-5 py-2 text-[13px] font-medium transition-colors ${
                    active === item.key
                      ? "bg-white text-black"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          );
        }

        const isOpen = open.includes(section.label);
        const hasActive = section.items.some((i) => i.key === active);

        return (
          <div key={si} className="border-b border-white/5">
            <button
              onClick={() => toggle(section.label!)}
              className={`w-full flex items-center justify-between px-5 py-3 text-left transition-colors cursor-pointer ${
                hasActive
                  ? "text-white"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-[11px] uppercase tracking-[0.15em] font-semibold">
                {section.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[10px] text-white/25 font-mono">{section.items.length}</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2 3.5L5 6.5L8 3.5" />
                </svg>
              </span>
            </button>

            <div
              className={`overflow-hidden transition-all duration-200 ${
                isOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {section.items.map((item, idx) => {
                const isActive = active === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-1.5 text-[12px] transition-colors ${
                      isActive
                        ? "bg-white text-black font-semibold"
                        : "text-white/40 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`w-5 text-right font-mono text-[10px] shrink-0 ${
                        isActive ? "text-black/40" : "text-white/20"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
