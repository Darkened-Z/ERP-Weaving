"use client";

import React, { useRef, useState, useEffect } from "react";

interface LineRow { srNo: number; than: number; mtrs: string; }

interface Props {
  initialLines: LineRow[];
  /** id of the <form> to submit into. The grid is rendered in a column OUTSIDE
   *  that form, so without this its hidden inputs are never submitted and every
   *  piece row is silently dropped on save. */
  formId?: string;
  /** Header fields the row totals are written into. */
  thanFieldId?: string;
  mtrsFieldId?: string;
  onTotalsChange?: (than: number, mtrs: number) => void;
}

export function DamiLineGrid({
  initialLines,
  formId,
  thanFieldId = "dami-than",
  mtrsFieldId = "dami-mtrs",
  onTotalsChange,
}: Props) {
  const [rows, setRows] = useState<LineRow[]>(() =>
    initialLines.length > 0
      ? initialLines
      : [{ srNo: 1, than: 1, mtrs: "" }]
  );
  const tableRef = useRef<HTMLTableElement>(null);

  // Calculate totals whenever rows change, and stamp them straight onto the
  // header fields. They used to be summed by a script listening for input
  // events, which read the hidden mirror inputs BEFORE React had re-rendered
  // them — so the header was always one edit behind and the voucher saved a
  // short meter total (three pieces of 100/200/300 stored 300, not 600).
  useEffect(() => {
    const totalThan = rows.reduce((s, r) => s + (r.than || 0), 0);
    const totalMtrs = rows.reduce((s, r) => s + (parseFloat(r.mtrs) || 0), 0);
    const write = (id: string, val: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el && el.value !== val) {
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    write(thanFieldId, String(totalThan));
    write(mtrsFieldId, totalMtrs ? String(Math.round(totalMtrs * 100) / 100) : "");
    onTotalsChange?.(totalThan, totalMtrs);
  }, [rows, onTotalsChange, thanFieldId, mtrsFieldId]);

  function updateRow(idx: number, field: "than" | "mtrs", val: string) {
    setRows(prev => {
      const next = [...prev];
      if (field === "than") {
        next[idx] = { ...next[idx], than: parseInt(val) || 1 };
      } else {
        next[idx] = { ...next[idx], mtrs: val };
      }
      return next;
    });
  }

  function addRow(afterIdx: number) {
    setRows(prev => {
      const next = [...prev];
      const newRow = { srNo: next.length + 1, than: 1, mtrs: "" };
      next.splice(afterIdx + 1, 0, newRow);
      // Re-number
      return next.map((r, i) => ({ ...r, srNo: i + 1 }));
    });
    // Focus next row's mtrs after render
    setTimeout(() => {
      const inputs = tableRef.current?.querySelectorAll<HTMLInputElement>(".mtrs-input");
      inputs?.[afterIdx + 1]?.focus();
    }, 30);
  }

  function deleteRow(idx: number) {
    if (rows.length <= 1) return;
    setRows(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((r, i) => ({ ...r, srNo: i + 1 }));
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, idx: number, field: "than" | "mtrs") {
    if (e.key === "Enter") {
      e.preventDefault();
      if (field === "than") {
        // Move to mtrs of same row
        const inputs = tableRef.current?.querySelectorAll<HTMLInputElement>(".mtrs-input");
        inputs?.[idx]?.focus();
      } else {
        // Move to next row, create if needed
        if (idx >= rows.length - 1) {
          addRow(idx);
        } else {
          const inputs = tableRef.current?.querySelectorAll<HTMLInputElement>(".mtrs-input");
          inputs?.[idx + 1]?.focus();
        }
      }
    }
  }

  const totalThan = rows.reduce((s, r) => s + (r.than || 0), 0);
  const totalMtrs = rows.reduce((s, r) => s + (parseFloat(r.mtrs) || 0), 0);

  return (
    <div>
      {/* Hidden inputs to submit to form */}
      <input type="hidden" form={formId} name="line_count" value={rows.length} />
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <input type="hidden" form={formId} name={`line_sr_${i}`} value={r.srNo} />
          <input type="hidden" form={formId} name={`line_than_${i}`} value={r.than} />
          <input type="hidden" form={formId} name={`line_mtrs_${i}`} value={r.mtrs} />
        </React.Fragment>
      ))}

      <table ref={tableRef} style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ background: "#e8eef6" }}>
            <th style={{ border: "1px solid #ccc", padding: "3px 6px", textAlign: "center", width: "40px" }}>S#</th>
            <th style={{ border: "1px solid #ccc", padding: "3px 6px", textAlign: "center", width: "60px" }}>Than</th>
            <th style={{ border: "1px solid #ccc", padding: "3px 6px", textAlign: "right" }}>Mtr</th>
            <th style={{ border: "1px solid #ccc", padding: "2px", width: "24px" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
              <td style={{ border: "1px solid #eee", padding: "1px 4px", textAlign: "center", color: "#888", fontSize: "10px" }}>{row.srNo}</td>
              <td style={{ border: "1px solid #eee", padding: "1px" }}>
                <input
                  type="number"
                  min={1}
                  value={row.than}
                  onChange={e => updateRow(idx, "than", e.target.value)}
                  onKeyDown={e => handleKeyDown(e, idx, "than")}
                  style={{ width: "100%", border: "none", background: "transparent", textAlign: "center", fontSize: "11px", outline: "none" }}
                />
              </td>
              <td style={{ border: "1px solid #eee", padding: "1px" }}>
                <input
                  type="number"
                  step="any"
                  value={row.mtrs}
                  onChange={e => updateRow(idx, "mtrs", e.target.value)}
                  onKeyDown={e => handleKeyDown(e, idx, "mtrs")}
                  className="mtrs-input"
                  style={{ width: "100%", border: "none", background: "transparent", textAlign: "right", fontSize: "11px", outline: "none" }}
                />
              </td>
              <td style={{ border: "1px solid #eee", padding: "1px", textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() => deleteRow(idx)}
                  style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "12px", lineHeight: 1, padding: "0 2px" }}
                  title="Delete row"
                >×</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "#dce8f8", fontWeight: 700 }}>
            <td colSpan={1} style={{ border: "1px solid #aaa", padding: "3px 6px", fontSize: "10px", color: "#555" }}>Total</td>
            <td style={{ border: "1px solid #aaa", padding: "3px 6px", textAlign: "center" }}>{totalThan}</td>
            <td style={{ border: "1px solid #aaa", padding: "3px 6px", textAlign: "right" }}>
              {totalMtrs.toLocaleString("en-PK", { maximumFractionDigits: 2 })}
            </td>
            <td style={{ border: "1px solid #aaa" }}></td>
          </tr>
        </tfoot>
      </table>

      <button
        type="button"
        onClick={() => addRow(rows.length - 1)}
        style={{ marginTop: "4px", fontSize: "10px", padding: "2px 8px", border: "1px solid #3b82f6", background: "#eff6ff", color: "#1d4ed8", cursor: "pointer" }}
      >
        + Add Row
      </button>
    </div>
  );
}
