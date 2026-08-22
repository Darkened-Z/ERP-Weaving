"use client";

import Link from "next/link";
import { useState } from "react";

type NavItem = { href: string; label: string; key: string };
type SubSection = { label: string; items: NavItem[] };
type Section = {
  label: string | null;
  items?: NavItem[];
  subsections?: SubSection[];
};

function totalItems(section: Section): number {
  if (section.subsections?.length) {
    return section.subsections.reduce((s, sub) => s + sub.items.length, 0);
  }
  return section.items?.length ?? 0;
}

function findActiveInSection(section: Section, active?: string): boolean {
  if (section.items?.some((i) => i.key === active)) return true;
  if (section.subsections?.some((sub) => sub.items.some((i) => i.key === active))) return true;
  return false;
}

function findActiveInSub(sub: SubSection, active?: string): boolean {
  return sub.items.some((i) => i.key === active);
}

const SECTION_COLORS: Record<string, string> = {
  Define: "var(--h1)",
  Inventory: "var(--h2)",
  "Inventory External": "var(--h3)",
  Finance: "var(--h4)",
  Store: "var(--h5)",
  Admin: "var(--h6)",
};

export function SidebarNav({ sections, active, onNavigate }: { sections: Section[]; active?: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState<string[]>(() => {
    const initial: string[] = [];
    for (const s of sections) {
      if (s.label && findActiveInSection(s, active)) {
        initial.push(s.label);
        if (s.subsections) {
          for (const sub of s.subsections) {
            if (findActiveInSub(sub, active)) initial.push(`${s.label}::${sub.label}`);
          }
        }
      }
    }
    return initial;
  });

  // Top-level sections are an accordion: opening one closes the others (and their sub-tabs).
  function toggleSection(label: string) {
    setOpen((prev) =>
      prev.includes(label)
        ? prev.filter((l) => l !== label && !l.startsWith(`${label}::`))
        : [label]
    );
  }

  // Sub-tabs toggle independently within their (single) open section.
  function toggleSub(id: string) {
    setOpen((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  return (
    <nav className="flex-1 py-2">
      {sections.map((section, si) => {
        if (!section.label) {
          return (
            <div key={si}>
              {section.items?.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
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
        const hasActive = findActiveInSection(section, active);
        const count = totalItems(section);
        const hasSubsections = Boolean(section.subsections?.length);

        return (
          <div key={si} className="border-b border-white/5">
            <button
              onClick={() => toggleSection(section.label!)}
              style={{ borderLeft: `4px solid ${SECTION_COLORS[section.label] ?? "transparent"}` }}
              className={`w-full flex items-center justify-between pl-4 pr-5 py-3 text-left transition-colors cursor-pointer ${
                hasActive
                  ? "text-white"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-[11px] uppercase tracking-[0.15em] font-semibold">
                {section.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-mono" style={{ color: SECTION_COLORS[section.label] ?? "rgba(255,255,255,0.25)" }}>{count}</span>
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
                isOpen ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {hasSubsections ? (
                section.subsections!.map((sub, sub_i) => {
                  const subId = `${section.label}::${sub.label}`;
                  const isSubOpen = open.includes(subId);
                  const subHasActive = findActiveInSub(sub, active);
                  return (
                    <div key={sub_i} className="border-t border-white/5">
                      <button
                        onClick={() => toggleSub(subId)}
                        className={`w-full flex items-center justify-between pl-8 pr-5 py-2 text-left transition-colors cursor-pointer ${
                          subHasActive
                            ? "text-white"
                            : "text-white/45 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold">
                          {sub.label}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] text-white/20 font-mono">{sub.items.length}</span>
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 10 10"
                            className={`transition-transform duration-200 ${isSubOpen ? "rotate-180" : ""}`}
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
                          isSubOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                        }`}
                      >
                        {sub.items.map((item, idx) => {
                          const isActive = active === item.key;
                          return (
                            <Link
                              key={item.key}
                              href={item.href}
                              onClick={onNavigate}
                              className={`flex items-center gap-3 pl-11 pr-5 py-1.5 text-[12px] transition-colors ${
                                isActive
                                  ? "bg-white text-black font-semibold"
                                  : "text-white/40 hover:text-white hover:bg-white/5"
                              }`}
                            >
                              <span
                                className={`w-4 text-right font-mono text-[10px] shrink-0 ${
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
                })
              ) : (
                section.items?.map((item, idx) => {
                  const isActive = active === item.key;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={onNavigate}
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
                })
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
