"use client";

import { useState } from "react";
import { SidebarNav } from "./sidebar-nav";
import { CommandPalette, CommandPaletteTrigger } from "./command-palette";

type NavItem = { href: string; label: string; key: string };
type SubSection = { label: string; items: NavItem[] };
type Section = { label: string | null; items?: NavItem[]; subsections?: SubSection[] };

export function ShellLayout({
  children,
  sections,
  active,
  sessionName,
  sessionRole,
  logoutAction,
}: {
  children: React.ReactNode;
  sections: Section[];
  active?: string;
  sessionName: string;
  sessionRole: string;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`w-56 bg-black text-white flex flex-col fixed h-screen overflow-y-auto scrollbar-thin z-50 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold tracking-tight">SK MILLS</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mt-1">
              Weaving Management
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-white/40 hover:text-white text-xl leading-none cursor-pointer p-1"
          >
            &times;
          </button>
        </div>

        <SidebarNav sections={sections} active={active} onNavigate={() => setOpen(false)} />

        <div className="p-5 border-t border-white/10">
          <div className="text-[12px] font-medium">{sessionName}</div>
          <div className="text-[9px] uppercase tracking-[0.1em] text-white/30 mt-0.5">
            {sessionRole}
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="mt-2 text-[10px] uppercase tracking-[0.08em] text-white/30 hover:text-white transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-30 bg-white border-b border-[var(--border-light)] px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="cursor-pointer p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="text-[13px] font-bold tracking-tight">SK MILLS</span>
          <div className="flex-1" />
          <div className="w-40">
            <CommandPaletteTrigger />
          </div>
        </div>
        <div className="sticky top-0 z-30 bg-white border-b border-[var(--border-light)] px-6 py-3 hidden lg:flex items-center justify-end gap-3">
          <CommandPaletteTrigger />
        </div>
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
          {children}
        </div>
      </main>

      <CommandPalette sections={sections} />
    </div>
  );
}
