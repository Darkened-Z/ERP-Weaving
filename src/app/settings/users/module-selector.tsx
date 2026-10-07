
"use client";
import { useState } from "react";

type Section = {
  label: string | null;
  items?: { href: string; label: string; key: string; bg?: string }[];
  subsections?: {
    label: string;
    itemBg?: string;
    items: { href: string; label: string; key: string; bg?: string }[];
  }[];
};

export function ModuleSelector({
  sections,
  initialAllowed
}: {
  sections: Section[];
  initialAllowed: string | null;
}) {
  const [mode, setMode] = useState<"ALL" | "RESTRICTED">(initialAllowed === null ? "ALL" : "RESTRICTED");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialAllowed ? initialAllowed.split(",").map(s => s.trim()).filter(Boolean) : [])
  );

  const toggleKey = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const toggleSection = (items: {key: string}[]) => {
    const keys = items.map(i => i.key);
    const allSelected = keys.every(k => selected.has(k));
    const next = new Set(selected);
    if (allSelected) {
      keys.forEach(k => next.delete(k));
    } else {
      keys.forEach(k => next.add(k));
    }
    setSelected(next);
  };

  return (
    <div className="mt-4 border border-black p-4 bg-gray-50">
      <div className="font-semibold mb-3 uppercase tracking-wider text-xs">Module Access</div>
      
      <div className="flex gap-4 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="accessMode" value="ALL" checked={mode === "ALL"} onChange={() => setMode("ALL")} />
          <span className="text-sm font-medium">All Modules (Default)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="accessMode" value="RESTRICTED" checked={mode === "RESTRICTED"} onChange={() => setMode("RESTRICTED")} />
          <span className="text-sm font-medium">Restricted Access</span>
        </label>
      </div>

      {mode === "RESTRICTED" && (
        <div className="space-y-4 border-t border-gray-300 pt-4 max-h-[400px] overflow-y-auto pr-2">
          {Array.from(selected).map(k => (
             <input key={"hidden-"+k} type="hidden" name="allowedModules" value={k} />
          ))}

          {sections.map((sec, i) => (
            <details key={i} className="border border-gray-200 bg-white group" open={true}>
              <summary className="bg-gray-100 p-2 cursor-pointer text-sm font-bold flex justify-between items-center select-none">
                <span>{sec.label || "General"}</span>
                <span className="text-xs text-gray-500 group-open:hidden">? Expand</span>
                <span className="text-xs text-gray-500 hidden group-open:block">? Collapse</span>
              </summary>
              <div className="p-3 space-y-3">
                {sec.items && sec.items.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sec.items.map(item => (
                      <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input 
                          type="checkbox" 
                          checked={selected.has(item.key)} 
                          onChange={() => toggleKey(item.key)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                )}
                
                {sec.subsections?.map((sub, j) => (
                  <div key={j} className="pl-2 border-l-2 border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-gray-600 uppercase tracking-wider">{sub.label}</div>
                      <button 
                        type="button" 
                        onClick={() => toggleSection(sub.items)}
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Toggle All
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sub.items.map(item => (
                        <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input 
                            type="checkbox" 
                            checked={selected.has(item.key)} 
                            onChange={() => toggleKey(item.key)}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

