"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Node = {
  code: string;
  description: string;
  level: number;
  children: Node[];
};

type Opt = { code: string; description: string; level: number };

/**
 * Modal picker for Chart of Accounts. Renders a small "F9" chevron button next
 * to the target input; clicking opens a popup showing the full hierarchy from
 * levels 1→N. User expands parents, clicks any account to pick, dialog closes
 * and the target Combobox / input is set (fires combobox:change so AutoFill can
 * react — same event Combobox itself dispatches).
 *
 * Params:
 *   targetName: form field name to set on pick
 *   options: flat list of every account with level info
 *   pickLevel?: only allow picking rows at this level (defaults: any)
 *   label?: dialog title
 */
export function AccountPicker({
  targetName,
  options,
  pickLevel,
  label = "Select Account Head",
}: {
  targetName: string;
  options: Opt[];
  pickLevel?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Build tree from flat options — assumes codes like "1.01.01.02" with dots.
  const tree = useMemo(() => {
    const map = new Map<string, Node>();
    const roots: Node[] = [];
    const sorted = [...options].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    for (const o of sorted) {
      const node: Node = { code: o.code, description: o.description, level: o.level, children: [] };
      map.set(o.code, node);
    }
    for (const o of sorted) {
      const node = map.get(o.code)!;
      const parts = o.code.split(".");
      if (parts.length === 1) {
        roots.push(node);
      } else {
        const parentCode = parts.slice(0, -1).join(".");
        const parent = map.get(parentCode);
        if (parent) parent.children.push(node);
        else roots.push(node); // orphan — surface as root
      }
    }
    return roots;
  }, [options]);

  // Auto-expand top-N when opening, and expand all matching search
  useEffect(() => {
    if (!open) return;
    const next = new Set<string>();
    if (q.trim()) {
      const ql = q.trim().toLowerCase();
      // Expand all ancestors of any node whose code or description matches
      const visit = (n: Node, ancestors: string[]) => {
        const hit = n.code.toLowerCase().includes(ql) || n.description.toLowerCase().includes(ql);
        if (hit) ancestors.forEach((a) => next.add(a));
        n.children.forEach((c) => visit(c, [...ancestors, n.code]));
      };
      tree.forEach((r) => visit(r, []));
    } else {
      // Default: expand L1 + L2 (show the "map")
      const visit = (n: Node, depth: number) => {
        if (depth < 2) next.add(n.code);
        n.children.forEach((c) => visit(c, depth + 1));
      };
      tree.forEach((r) => visit(r, 0));
    }
    setExpanded(next);
  }, [open, q, tree]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  const pick = (node: Node) => {
    if (pickLevel != null && node.level !== pickLevel) return;
    const els = document.querySelectorAll(`[name="${targetName}"]`) as NodeListOf<HTMLInputElement>;
    els.forEach((el) => {
      el.value = node.code;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // Fire the Combobox event so descTargetId mirror + AutoFill wire up.
    document.dispatchEvent(new CustomEvent("combobox:set", { detail: { name: targetName, value: node.code } }));
    document.dispatchEvent(new CustomEvent("combobox:change", { detail: { name: targetName, value: node.code } }));
    setOpen(false);
    setQ("");
  };

  // Filter — show a node if it matches OR any descendant matches
  const matches = (n: Node, ql: string): boolean => {
    if (!ql) return true;
    if (n.code.toLowerCase().includes(ql) || n.description.toLowerCase().includes(ql)) return true;
    return n.children.some((c) => matches(c, ql));
  };
  const ql = q.trim().toLowerCase();

  const renderNode = (n: Node) => {
    if (!matches(n, ql)) return null;
    const canExpand = n.children.length > 0;
    const isOpen = expanded.has(n.code);
    const canPick = pickLevel == null || n.level === pickLevel;
    const levelClass =
      n.level === 1 ? "font-bold uppercase tracking-wide bg-slate-100" :
      n.level === 2 ? "font-semibold bg-slate-50" :
      n.level === 3 ? "font-medium" :
      n.level === 4 ? "" :
      "text-[12px] text-[var(--muted)]";
    return (
      <div key={n.code}>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 border-b border-[var(--border-light)] hover:bg-blue-50 ${levelClass}`}
          style={{ paddingLeft: 4 + (n.level - 1) * 18 }}
        >
          <button
            type="button"
            className="w-4 text-center text-[var(--muted)]"
            onClick={() => {
              setExpanded((s) => {
                const next = new Set(s);
                if (next.has(n.code)) next.delete(n.code);
                else next.add(n.code);
                return next;
              });
            }}
            disabled={!canExpand}
            style={{ opacity: canExpand ? 1 : 0.2 }}
          >
            {canExpand ? (isOpen ? "▾" : "▸") : "•"}
          </button>
          <span className="mono text-[11px] text-[var(--muted)] w-24 shrink-0">{n.code}</span>
          <button
            type="button"
            className="text-left flex-1 text-[13px]"
            onClick={() => canPick && pick(n)}
            style={{ cursor: canPick ? "pointer" : "default", opacity: canPick ? 1 : 0.6 }}
          >
            {n.description}
          </button>
          <span className="mono text-[9px] text-[var(--muted)]">L{n.level}</span>
        </div>
        {isOpen && n.children.length > 0 && (
          <div>{n.children.map((c) => renderNode(c))}</div>
        )}
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-xs mono"
        onClick={() => setOpen(true)}
        title="Open picker (F9)"
        style={{ padding: "3px 8px" }}
      >
        F9 ▾
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="bg-white border-2 border-black shadow-lg flex flex-col"
            style={{ width: "min(720px, 92vw)", maxHeight: "80vh" }}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-black bg-slate-50">
              <div className="text-[13px] font-semibold uppercase tracking-wide">{label}</div>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-outline btn-xs">Close ✕</button>
            </div>
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <input
                ref={inputRef}
                className="input-box text-[13px] w-full"
                placeholder="Search code or description..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-auto text-[13px]">
              {tree.map((r) => renderNode(r))}
            </div>
            <div className="px-3 py-1.5 border-t border-[var(--border)] text-[10px] text-[var(--muted)] flex justify-between">
              <span>▸ / ▾ to expand • Click description to pick{pickLevel != null ? ` (Level ${pickLevel} only)` : ""}</span>
              <span>{options.length} accounts</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
