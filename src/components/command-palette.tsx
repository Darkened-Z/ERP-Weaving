"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type NavItem = { href: string; label: string; key: string };
type SubSection = { label: string; items: NavItem[] };
type Section = { label: string | null; items?: NavItem[]; subsections?: SubSection[] };

type SearchResult = {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

type Row = {
  type: string;
  title: string;
  subtitle?: string;
  href: string;
  group: string;
};

export function CommandPalette({ sections }: { sections: Section[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const pages = useMemo(() => {
    const items: { label: string; href: string; group: string }[] = [];
    for (const s of sections) {
      const group = s.label || "General";
      for (const it of s.items ?? []) {
        items.push({ label: it.label, href: it.href, group });
      }
      for (const sub of s.subsections ?? []) {
        const subGroup = `${group} · ${sub.label}`;
        for (const it of sub.items) {
          items.push({ label: it.label, href: it.href, group: subGroup });
        }
      }
    }
    return items;
  }, [sections]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("command-palette:open", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("command-palette:open", onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      document.body.style.overflow = "";
      setQ("");
      setResults([]);
      setSelected(0);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    setSelected(0);
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
          signal: ctrl.signal,
        });
        if (r.ok) {
          const data = await r.json();
          setResults(data.results ?? []);
        } else {
          setResults([]);
        }
      } catch {
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);

  const rows: Row[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    const matchingPages = query
      ? pages.filter((p) => p.label.toLowerCase().includes(query) || p.group.toLowerCase().includes(query))
      : [];
    const pageRows: Row[] = matchingPages.slice(0, 10).map((p) => ({
      type: "Page",
      title: p.label,
      subtitle: p.group,
      href: p.href,
      group: "Pages",
    }));
    const resultRows: Row[] = results.map((r) => ({
      type: r.type,
      title: r.title,
      subtitle: r.subtitle,
      href: r.href,
      group: r.type,
    }));
    return [...pageRows, ...resultRows];
  }, [pages, q, results]);

  const grouped = useMemo(() => {
    const map = new Map<string, { row: Row; index: number }[]>();
    rows.forEach((row, index) => {
      const arr = map.get(row.group) ?? [];
      arr.push({ row, index });
      map.set(row.group, arr);
    });
    return Array.from(map.entries());
  }, [rows]);

  function go(row: Row) {
    setOpen(false);
    router.push(row.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rows.length === 0) return;
      setSelected((s) => Math.min(s + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length === 0) return;
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[selected];
      if (row) go(row);
    }
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute("disabled"));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (selected > rows.length - 1) setSelected(Math.max(0, rows.length - 1));
  }, [rows.length, selected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="relative bg-white border-2 border-black w-full max-w-[600px] shadow-lg"
        style={{ maxHeight: "70vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onPanelKeyDown}
      >
        <div className="border-b-2 border-black">
          <input
            ref={inputRef}
            className="input-box border-0 text-[14px]"
            placeholder="Search accounts, contracts, beams, pages..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto scrollbar-thin"
          style={{ minHeight: 0 }}
        >
          {q.trim().length < 2 && (
            <div className="p-6 text-center">
              <div className="text-[13px] text-[var(--muted)] mb-3">Type to search...</div>
              <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                <kbd className="mono border border-[var(--border-light)] px-1.5 py-0.5 text-[10px]">
                  Ctrl
                </kbd>
                <span>+</span>
                <kbd className="mono border border-[var(--border-light)] px-1.5 py-0.5 text-[10px]">
                  K
                </kbd>
                <span className="ml-2">to toggle</span>
              </div>
            </div>
          )}

          {q.trim().length >= 2 && rows.length === 0 && !loading && (
            <div className="p-6 text-center text-[13px] text-[var(--muted)]">
              No results for &quot;{q}&quot;
            </div>
          )}

          {loading && rows.length === 0 && (
            <div className="p-6 text-center text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
              Searching...
            </div>
          )}

          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--muted)] bg-[var(--surface)] border-b border-[var(--border-light)]">
                {group}
              </div>
              {items.map(({ row, index }) => {
                const isSel = index === selected;
                return (
                  <div
                    key={index}
                    data-index={index}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => go(row)}
                    className={`px-3 py-2 cursor-pointer border-b border-[var(--border-light)] flex items-center justify-between gap-3 ${
                      isSel ? "bg-black text-white" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{row.title}</div>
                      {row.subtitle && (
                        <div
                          className={`mono text-[11px] truncate mt-0.5 ${
                            isSel ? "text-white/60" : "text-[var(--muted)]"
                          }`}
                        >
                          {row.subtitle}
                        </div>
                      )}
                    </div>
                    <div
                      className={`text-[9px] uppercase tracking-[0.1em] font-semibold shrink-0 border px-1.5 py-0.5 ${
                        isSel
                          ? "border-white/40 text-white/70"
                          : "border-[var(--border-light)] text-[var(--muted)]"
                      }`}
                    >
                      {row.type}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-t-2 border-black px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="mono border border-[var(--border-light)] px-1 py-0.5">Up</kbd>
              <kbd className="mono border border-[var(--border-light)] px-1 py-0.5">Down</kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="mono border border-[var(--border-light)] px-1 py-0.5">Enter</kbd>
              <span>Open</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="mono border border-[var(--border-light)] px-1 py-0.5">Esc</kbd>
              <span>Close</span>
            </span>
          </div>
          <div className="mono">{rows.length}</div>
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger() {
  function open() {
    document.dispatchEvent(new CustomEvent("command-palette:open"));
  }
  return (
    <button
      type="button"
      onClick={open}
      className="flex items-center gap-2 border border-[var(--border-light)] hover:border-black transition-colors bg-white px-3 py-1.5 text-left cursor-pointer w-full sm:w-[280px]"
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] shrink-0">
        <circle cx="9" cy="9" r="6" />
        <path d="M14 14l4 4" />
      </svg>
      <span className="text-[12px] text-[var(--muted)] flex-1 truncate">Search...</span>
      <span className="hidden sm:flex items-center gap-1 shrink-0">
        <kbd className="mono border border-[var(--border-light)] px-1 py-0 text-[10px] text-[var(--muted)]">Ctrl</kbd>
        <kbd className="mono border border-[var(--border-light)] px-1 py-0 text-[10px] text-[var(--muted)]">K</kbd>
      </span>
    </button>
  );
}
