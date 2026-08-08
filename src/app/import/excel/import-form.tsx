"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type TargetKey =
  | "chart-of-accounts"
  | "yarn-opening"
  | "grey-opening"
  | "beam-opening"
  | "grey-construction"
  | "products";

type Target = { key: TargetKey; label: string; table: string; fields: string[] };

const TARGETS: Target[] = [
  {
    key: "chart-of-accounts",
    label: "Chart of Accounts",
    table: "chart_of_accounts",
    fields: ["code", "description", "descShort", "level", "city", "phone", "mobile", "email", "gstNo", "ntn"],
  },
  {
    key: "yarn-opening",
    label: "Yarn Opening",
    table: "inventory_opening (YARN)",
    fields: ["itemCode", "description", "openingQty", "openingRate", "openingAmount", "unit", "location", "entryDate", "brand"],
  },
  {
    key: "grey-opening",
    label: "Grey Opening",
    table: "inventory_opening (GREY)",
    fields: ["itemCode", "description", "openingQty", "unit", "location", "entryDate", "grayWidth", "greyPick", "productName"],
  },
  {
    key: "beam-opening",
    label: "Beam Opening",
    table: "inventory_opening (BEAM)",
    fields: ["itemCode", "description", "openingQty", "unit", "location", "entryDate"],
  },
  {
    key: "grey-construction",
    label: "Grey Construction",
    table: "grey_construction",
    fields: ["code", "description", "reed", "pick", "width", "warpCount", "weftCount", "weaveType", "gsm"],
  },
  {
    key: "products",
    label: "Products",
    table: "products",
    fields: ["code", "description", "mainDesc", "subDesc", "mainCode", "subCode"],
  },
];

function autoMapColumns(hdrs: string[], fields: string[]): Record<string, string> {
  const auto: Record<string, string> = {};
  for (const f of fields) {
    const match = hdrs.find(
      (h) =>
        h.trim().toLowerCase() === f.toLowerCase() ||
        h.trim().toLowerCase().replace(/[^a-z0-9]/g, "") === f.toLowerCase().replace(/[^a-z0-9]/g, "")
    );
    if (match) auto[f] = match;
  }
  return auto;
}

export function ImportForm() {
  const [targetKey, setTargetKey] = useState<TargetKey>("chart-of-accounts");
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const target = useMemo(() => TARGETS.find((t) => t.key === targetKey)!, [targetKey]);

  const resetFile = () => {
    setFileName("");
    setRows([]);
    setHeaders([]);
    setMapping({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > 5_000_000) {
      setError("File too large (>5MB). Try splitting into smaller sheets.");
      resetFile();
      return;
    }
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const hdrs = json.length ? Object.keys(json[0]) : [];
      setRows(json);
      setHeaders(hdrs);
      setMapping(autoMapColumns(hdrs, target.fields));
    } catch {
      setError("Could not parse file. Make sure it's a valid Excel/CSV file.");
      resetFile();
    }
  };

  const changeTarget = (k: TargetKey) => {
    setTargetKey(k);
    const newTarget = TARGETS.find((t) => t.key === k)!;
    setMapping(headers.length > 0 ? autoMapColumns(headers, newTarget.fields) : {});
  };

  const preview = rows.slice(0, 20);

  return (
    <div className="space-y-8">
      <section className="border border-black">
        <header className="border-b border-black px-4 py-2 flex items-baseline gap-3">
          <span className="mono text-[11px] font-bold">STEP 1</span>
          <span className="label">Target</span>
        </header>
        <div className="p-4">
          <label className="label block mb-1">Import into</label>
          <select
            className="input-box"
            value={targetKey}
            onChange={(e) => changeTarget(e.target.value as TargetKey)}
          >
            {TARGETS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="text-[11px] text-[var(--muted)] mono mt-2">Table: {target.table}</div>
        </div>
      </section>

      <section className="border border-black">
        <header className="border-b border-black px-4 py-2 flex items-baseline gap-3">
          <span className="mono text-[11px] font-bold">STEP 2</span>
          <span className="label">Upload File</span>
        </header>
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="input-box text-[13px]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {fileName ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFile}>
                Clear
              </button>
            ) : null}
          </div>
          {error ? (
            <div className="text-[12px] mb-3" style={{ color: "#c00" }}>{error}</div>
          ) : null}
          {fileName ? (
            <div className="text-[13px] mono mb-4">
              {fileName} &middot; {rows.length} row{rows.length === 1 ? "" : "s"} &middot; {headers.length} column{headers.length === 1 ? "" : "s"}
            </div>
          ) : (
            <div className="text-[13px] text-[var(--muted)]">
              Choose a .xlsx, .xls, or .csv file. Preview is generated in-browser.
            </div>
          )}

          {preview.length ? (
            <div className="overflow-x-auto border border-black">
              <table>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      {headers.map((h) => (
                        <td key={h} className="mono text-[12px]">
                          {String(r[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > preview.length ? (
                <div className="text-[11px] text-[var(--muted)] mono px-3 py-2 border-t border-black">
                  Showing first {preview.length} of {rows.length} rows.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-black">
        <header className="border-b border-black px-4 py-2 flex items-baseline gap-3">
          <span className="mono text-[11px] font-bold">STEP 3</span>
          <span className="label">Column Mapping</span>
        </header>
        <div className="p-4">
          {headers.length === 0 ? (
            <div className="text-[13px] text-[var(--muted)]">Upload a file to map columns.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {target.fields.map((f) => (
                <div key={f}>
                  <label className="label block mb-1">{f}</label>
                  <select
                    className="input-box text-[13px]"
                    value={mapping[f] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value }))}
                  >
                    <option value="">-- unmapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border border-black">
        <header className="border-b border-black px-4 py-2 flex items-baseline gap-3">
          <span className="mono text-[11px] font-bold">STEP 4</span>
          <span className="label">Import</span>
        </header>
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[13px] text-[var(--muted)]">
            {rows.length
              ? `Ready to import ${rows.length} row${rows.length === 1 ? "" : "s"} into ${target.table}.`
              : "Complete steps 1-3 to enable import."}
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!rows.length}
            onClick={() => setModalOpen(true)}
            style={{ opacity: rows.length ? 1 : 0.4, cursor: rows.length ? "pointer" : "not-allowed" }}
          >
            Import
          </button>
        </div>
      </section>

      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "16px",
          }}
        >
          <div className="bg-white border border-black p-6 max-w-md w-full">
            <div className="label mb-3">Import Preview</div>
            <div className="text-[14px] mb-4">
              Would import <span className="mono font-bold">{rows.length}</span> row
              {rows.length === 1 ? "" : "s"} into <span className="mono font-bold">{target.table}</span>.
            </div>
            <div className="text-[12px] text-[var(--muted)] mb-6">
              This is a preview build - actual import coming in v2.
            </div>
            <div className="flex justify-end">
              <button className="btn btn-sm" onClick={() => setModalOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
