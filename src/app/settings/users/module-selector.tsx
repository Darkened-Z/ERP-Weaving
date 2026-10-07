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
  const [showModal, setShowModal] = useState(false);

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
      
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-2">
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
        <div className="mt-3">
          <button 
            type="button" 
            onClick={() => setShowModal(true)}
            className="btn btn-outline btn-sm bg-white"
          >
            Configure Modules ({selected.size} selected)
          </button>

          {Array.from(selected).map(k => (
             <input key={"hidden-"+k} type="hidden" name="allowedModules" value={k} />
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white border border-black shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-300 bg-gray-50">
              <h2 className="text-lg font-bold">Select Permitted Modules</h2>
              <button 
                type="button" 
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-black font-bold text-xl px-2"
              >
                &times;
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {sections.map((sec, i) => (
                <details key={i} className="border border-gray-200 bg-white group" open={true}>
                  <summary className="bg-gray-100 p-3 cursor-pointer text-sm font-bold flex justify-between items-center select-none">
                    <span>{sec.label || "General"}</span>
                    <span className="text-xs text-gray-500 group-open:hidden">? Expand</span>
                    <span className="text-xs text-gray-500 hidden group-open:block">? Collapse</span>
                  </summary>
                  <div className="p-4 space-y-4">
                    {sec.items && sec.items.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {sec.items.map(item => (
                          <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                            <input 
                              type="checkbox" 
                              checked={selected.has(item.key)} 
                              onChange={() => toggleKey(item.key)}
                              className="w-4 h-4"
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    )}
                    
                    {sec.subsections?.map((sub, j) => (
                      <div key={j} className="pl-3 border-l-2 border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs font-bold text-gray-600 uppercase tracking-wider">{sub.label}</div>
                          <button 
                            type="button" 
                            onClick={() => toggleSection(sub.items)}
                            className="text-[11px] text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                          >
                            Toggle All
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {sub.items.map(item => (
                            <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200">
                              <input 
                                type="checkbox" 
                                checked={selected.has(item.key)} 
                                onChange={() => toggleKey(item.key)}
                                className="w-4 h-4"
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

            <div className="p-4 border-t border-gray-300 bg-gray-50 flex justify-end">
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
