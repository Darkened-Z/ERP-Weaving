"use client";

import { useEffect, useState, useCallback } from "react";

const round = (v: number, d: number) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

type BeamStat = { rcvd: number; length: number | null };

/**
 * Daily Production — split-grid live math (counts table on top, beam table below,
 * rows paired by INDEX):
 *   Counts row i:  Total = A + B + C + CP + PPC
 *   Beam row i:    Rcvd/Mtr = serverAccumulated (Σ totalCount+rejCount across ALL
 *                  saved production excluding this voucher, keyed by beamNo)
 *                  + countsRow[i].total + countsRow[i].rej
 *                  Diff = bLength − rcvdMtr · Shrinkage = diff / bLength × 100
 * The `data-near-empty` span in each beam row shows "NEAR EMPTY" while diff < 500.
 * Server-side saveAction recomputes totalCount authoritatively.
 */
export function ProductionSetCalc({
  beamStats,
}: {
  beamStats: Record<string, BeamStat>;
}) {
  useEffect(() => {
    const COUNT_SOURCES = new Set(["aCount", "bCount", "cCount", "cpCount", "ppcCount"]);
    const BEAM_SOURCES = new Set(["rejCount", "beamNo", "bLength"]);

    const countRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("#idp-count-rows tr"));
    const beamRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("#idp-beam-rows tr"));

    const eachPair = (ci: number) => {
      const cRow = countRows()[ci];
      const bRow = beamRows()[ci];
      if (!cRow) return;
      const cq = (n: string) => cRow.querySelector<HTMLInputElement>(`[name="${n}"]`);
      const cnum = (n: string) => {
        const x = parseFloat(cq(n)?.value ?? "");
        return Number.isFinite(x) ? x : 0;
      };
      // Total lives in the counts row.
      const totalEl = cq("totalCount");
      if (totalEl) {
        const total = round(
          cnum("aCount") + cnum("bCount") + cnum("cCount") + cnum("cpCount") + cnum("ppcCount"),
          2
        );
        if (String(total) !== totalEl.value) totalEl.value = total ? String(total) : "";
      }
      if (!bRow) return;
      const bq = (n: string) => bRow.querySelector<HTMLInputElement>(`[name="${n}"]`);
      const bnum = (n: string) => {
        const x = parseFloat(bq(n)?.value ?? "");
        return Number.isFinite(x) ? x : 0;
      };
      const beamNo = (bq("beamNo")?.value ?? "").trim();
      const stat: BeamStat | undefined = beamNo ? beamStats[beamNo] : undefined;
      const bLenEl = bq("bLength");
      if (bLenEl && !bLenEl.value && stat?.length != null) {
        bLenEl.value = String(stat.length);
      }
      const bLen = bnum("bLength");
      // Rejection is a counts-row box ("up to Rejection stays on top").
      const rej = (() => {
        const x = parseFloat(cq("rejCount")?.value ?? "");
        return Number.isFinite(x) ? x : 0;
      })();
      const rcvd = beamNo ? round((stat?.rcvd ?? 0) + (cnum("totalCount") || 0) + rej, 2) : 0;
      const diff = bLen > 0 ? round(bLen - rcvd, 2) : 0;
      const shr = bLen > 0 ? round((diff / bLen) * 100, 2) : 0;
      const rcvdEl = bq("rcvdMtr");
      const diffEl = bq("diff");
      const shrEl = bq("shrinkage");
      if (rcvdEl) rcvdEl.value = beamNo && rcvd ? String(rcvd) : "";
      if (diffEl) diffEl.value = beamNo && bLen > 0 ? String(diff) : "";
      if (shrEl) shrEl.value = beamNo && bLen > 0 ? String(shr) : "";
      const hint = bRow.querySelector<HTMLElement>("[data-near-empty]");
      if (hint) {
        hint.textContent = beamNo && bLen > 0 && diff < 500 && diff >= 0 ? "NEAR EMPTY" : "";
      }
    };

    const recompute = () => {
      const n = Math.max(countRows().length, beamRows().length);
      for (let i = 0; i < n; i++) eachPair(i);
    };
    const onEvt = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t?.name) return;
      if (!COUNT_SOURCES.has(t.name) && !BEAM_SOURCES.has(t.name) && t.name !== "totalCount") return;
      const tr = t.closest("tr");
      if (!tr) return;
      const inCounts = tr.closest("#idp-count-rows");
      const idx = Array.from((inCounts ? countRows() : beamRows())).indexOf(tr);
      if (idx >= 0) eachPair(idx);
    };
    recompute();
    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);
    return () => {
      document.removeEventListener("input", onEvt, true);
      document.removeEventListener("change", onEvt, true);
    };
  }, [beamStats]);
  return null;
}

type LoomBeamFill = {
  beamNo: string | null;
  beamSetNo: string | null;
  setHash: string | null;
  beamStatus: string | null;
  ends: number | null;
  bLength: number | null;
  contNo: string | null;
  setNo?: string | null;
  partyTrade?: string | null;
};

/**
 * Header Loom# pick → open that loom's mounted beams in the beam grid. One loom
 * can carry several knotted beams ("1, 2 — however many there are"): row 1 gets
 * the first beam, row 2 the second, and so on. Rows beyond the beam list clear.
 * Fill data comes from the server-mounted-beam map keyed by "shed|loomNo".
 */
export function LoomBeamsFill({
  map,
  maxRows = 8,
}: {
  map: Record<string, LoomBeamFill[]>;
  maxRows?: number;
}) {
  useEffect(() => {
    const beamRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("#idp-beam-rows tr"));
    const setEl = (tr: HTMLTableRowElement, name: string, v: string | number | null, display?: string) => {
      const el = tr.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (!el) return;
      const next = v == null ? "" : String(v);
      if (el.value !== next) {
        el.value = next;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      // Hidden FindingPicker fields (e.g. beamNo) have a readonly display twin —
      // keep its visible text in sync.
      if (el.type === "hidden" && display != null) {
        const picker = tr.querySelector<HTMLInputElement>('input[data-lov-picker]');
        if (picker && picker.value !== display) picker.value = display;
      }
    };
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name !== "headerLoom") return;
      const beams = map[d.value ?? ""] ?? [];
      const rows = beamRows();
      // Always sweep to maxRows: fill from the loom's knotted beams, CLEAR
      // everything else — switching looms must never leave the previous loom's
      // beams behind, and a loom with no knotting clears the grid entirely.
      for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
        const tr = rows[i];
        const fill = beams[i];
        if (fill) {
          const beamDisplay = fill.beamNo
            ? `${fill.beamNo}${fill.beamSetNo ? " — " + fill.beamSetNo : ""}`
            : "";
          setEl(tr, "beamNo", fill.beamNo, beamDisplay);
          setEl(tr, "beamSetNo", fill.beamSetNo);
          setEl(tr, "kSmType", fill.setHash ? "K" : null); // knotting type hint
          setEl(tr, "beamStatus", fill.beamStatus ?? "RUNNING");
          setEl(tr, "ends", fill.ends);
          setEl(tr, "bLength", fill.bLength);
          setEl(tr, "contNo", fill.contNo);
        } else {
          setEl(tr, "beamNo", null, "");
          setEl(tr, "beamSetNo", null);
          setEl(tr, "kSmType", null);
          setEl(tr, "beamStatus", null);
          setEl(tr, "ends", null);
          setEl(tr, "bLength", null);
          setEl(tr, "contNo", null);
        }
      }
      // First beam's contract → fill header conv_contract so AutoFill picks up party/quality/brand.
      const contNo = beams[0]?.contNo ?? null;
      document.dispatchEvent(
        new CustomEvent("combobox:set", { detail: { name: "conv_contract", value: contNo ?? "" } })
      );
      if (contNo) {
        document.dispatchEvent(
          new CustomEvent("combobox:change", { detail: { name: "conv_contract", value: contNo } })
        );
      }
      // First beam's party → fill header Beam Cost Party.
      const beamParty = beams[0]?.partyTrade ?? null;
      document.dispatchEvent(
        new CustomEvent("combobox:set", { detail: { name: "beamContParty", value: beamParty ?? "" } })
      );
    };
    document.addEventListener("combobox:change", onChange);
    return () => document.removeEventListener("combobox:change", onChange);
  }, [map, maxRows]);
  return null;
}

/**
 * Hides trailing EMPTY rows in the paired Daily Production tables so the grids
 * only show rows actually in use (owner: the fixed blank rows are gone). Keeps
 * at least one visible row for manual entry, and keeps both tables cut at the
 * SAME index so row pairing stays intact. Sweeps on every input/change.
 */
export function HideEmptyRows({ tbodyIds }: { tbodyIds: string[] }) {
  useEffect(() => {
    const sweep = () => {
      const tbodies = tbodyIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
      if (!tbodies.length) return;
      const rowLists = tbodies.map((tb) => Array.from(tb.querySelectorAll("tr")));
      const hasData = (tr: HTMLTableRowElement) =>
        Array.from(tr.querySelectorAll("input, select, textarea")).some(
          (el) => (el as HTMLInputElement).value.trim() !== ""
        );
      // Last index (0-based) holding data across ALL paired tables.
      let lastFilled = -1;
      rowLists.forEach((rows) =>
        rows.forEach((r, i) => {
          if (hasData(r)) lastFilled = Math.max(lastFilled, i);
        })
      );
      const visibleCount = Math.max(lastFilled + 2, 1); // +1 spare blank row for the next entry
      rowLists.forEach((rows) => {
        rows.forEach((r, i) => {
          r.style.display = i < visibleCount ? "" : "none";
        });
      });
    };
    const onEvt = () => setTimeout(sweep, 0);
    sweep();
    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);
    document.addEventListener("combobox:change", onEvt);
    return () => {
      document.removeEventListener("input", onEvt, true);
      document.removeEventListener("change", onEvt, true);
      document.removeEventListener("combobox:change", onEvt);
    };
  }, [tbodyIds]);
  return null;
}

/**
 * When a beam is manually picked in a beam row (FindingPicker fires combobox:change
 * with name "beamNo"), fill the header Beam Cost Party from the beam's partyTrade.
 */
export function BeamPartyFill({ map }: { map: Record<string, string | null> }) {
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name !== "beamNo" || !d.value) return;
      const party = map[d.value] ?? null;
      document.dispatchEvent(
        new CustomEvent("combobox:set", { detail: { name: "beamContParty", value: party ?? "" } })
      );
    };
    document.addEventListener("combobox:change", onChange);
    return () => document.removeEventListener("combobox:change", onChange);
  }, [map]);
  return null;
}

/**
 * Header Set# (F9) pick (Oracle: type the set no → everything fills): sets the
 * header Loom# for that beam set, which in turn opens ALL of the loom's knotted
 * beams in the beam grid via LoomBeamsFill.
 */
export function HeaderSetFill({
  map,
}: {
  map: Record<string, { headerLoom: string }>;
}) {
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name !== "headerSetNo" || !d.value) return;
      const fill = map[d.value];
      if (!fill) return;
      document.dispatchEvent(
        new CustomEvent("combobox:set", { detail: { name: "headerLoom", value: fill.headerLoom } })
      );
      document.dispatchEvent(
        new CustomEvent("combobox:change", { detail: { name: "headerLoom", value: fill.headerLoom } })
      );
    };
    document.addEventListener("combobox:change", onChange);
    return () => document.removeEventListener("combobox:change", onChange);
  }, [map]);
  return null;
}

/**
 * The ✕ button: erases the WHOLE logical row — its own <tr> in `tbodyId` and the
 * paired row (same index) in `pairTbodyId`. Clears every input/select, fires
 * input/change so the live calcs and than serials update, and resets
 * FindingPicker displays.
 */
export function RowErase({ tbodyId, pairTbodyId }: { tbodyId: string; pairTbodyId: string }) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest?.("button[data-row-erase]");
      if (!btn) return;
      e.preventDefault();
      const tbody = document.getElementById(tbodyId);
      const tr = btn.closest("tr");
      if (!tbody || !tr || !tbody.contains(tr)) return;
      const idx = Array.from(tbody.querySelectorAll("tr")).indexOf(tr);
      const clear = (row: HTMLTableRowElement | undefined | null) => {
        if (!row) return;
        row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select, textarea").forEach((el) => {
          el.value = "";
          delete el.dataset.live;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        });
        // FindingPicker displays keep a friendly "code — description" text; blank it.
        row.querySelectorAll<HTMLInputElement>("input[data-lov-picker]").forEach((el) => {
          el.value = "";
        });
      };
      clear(tr as HTMLTableRowElement);
      const pairRows = document.getElementById(pairTbodyId)?.querySelectorAll("tr");
      if (pairRows) clear(pairRows[idx] as HTMLTableRowElement);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [tbodyId, pairTbodyId]);
  return null;
}

/**
 * Grey Despatch — live amount chain and count-grid weight:
 *   qtyMtrs = Σ line_len_${i}
 *   amnt    = qtyMtrs × conv_rate
 *   gst     = amnt × gst_rate% / 100
 *   further = amnt × ftx_rate% / 100
 *   amt_tot = amnt + gst + further
 *   TOT Lbs (per count row) = wt_per_mtr × qtyMtrs
 * gst_rate / ftx_rate are unstored hidden inputs — filled by AutoFill on contract pick.
 */
export function DespatchAmountCalc({
  countRows = 5,
  lineRows = 15,
}: {
  countRows?: number;
  lineRows?: number;
}) {
  useEffect(() => {
    const q = (name: string) =>
      document.querySelector<HTMLInputElement>(`[name="${name}"]`);
    const num = (name: string) => {
      const x = parseFloat(q(name)?.value ?? "");
      return Number.isFinite(x) ? x : 0;
    };
    const set = (name: string, val: string) => {
      const el = q(name);
      if (!el || el.value === val) return;
      el.value = val;
    };
    const recompute = () => {
      let qtyMtrs = 0;
      let thanCount = 0;
      for (let i = 1; i <= lineRows; i++) {
        const l = num(`line_len_${i}`);
        qtyMtrs += l;
        const tv = (q(`line_t_sr_${i}`)?.value ?? "").trim();
        if (tv || l > 0) thanCount++;
      }
      qtyMtrs = round(qtyMtrs, 2);
      const convRate = num("conv_rate");
      const amnt = round(qtyMtrs * convRate, 2);
      const gstRate = num("gst_rate");
      const ftxRate = num("ftx_rate");
      const gst = round((amnt * gstRate) / 100, 2);
      const further = round((amnt * ftxRate) / 100, 2);
      const total = round(amnt + gst + further, 2);
      set("qty_mtrs_calc", qtyMtrs ? String(qtyMtrs) : "");
      set("than_qty_calc", thanCount ? String(thanCount) : "");
      set("amnt", amnt ? String(amnt) : "");
      set("gst", gst ? String(gst) : "");
      set("further", further ? String(further) : "");
      set("amt_tot", total ? String(total) : "");
      for (let i = 1; i <= countRows; i++) {
        const wt = num(`uc_wt_${i}`);
        set(`uc_tot_${i}`, wt && qtyMtrs ? String(round(wt * qtyMtrs, 2)) : "");
      }
    };
    const onEvt = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t?.name) return;
      if (
        t.name.startsWith("line_len_") ||
        t.name.startsWith("line_t_sr_") ||
        t.name.startsWith("uc_wt_") ||
        t.name === "conv_rate" ||
        t.name === "gst_rate" ||
        t.name === "ftx_rate"
      ) {
        recompute();
      }
    };
    recompute();
    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);
    return () => {
      document.removeEventListener("input", onEvt, true);
      document.removeEventListener("change", onEvt, true);
    };
  }, [countRows, lineRows]);
  return null;
}

type CountRow = {
  count?: string | null;
  calCount?: number | null;
  ends?: number | null;
  ratePerLbs?: number | null;
  wtPerMtr?: number | null;
  costPerMtr?: number | null;
};

/**
 * Populates the Update-Count grid from the selected Conv Contract. Combines
 * intGreyConversionWarp + intGreyConversionWeft rows for the contract (keyed by
 * contNo). Only fills empty cells so a manually edited grid is not clobbered.
 * Triggered by a combobox:change on `conv_cont_no`.
 */
type ThanRow = {
  mm: string | null;
  totalCount: number | null;
  aCount: number | null;
  bCount: number | null;
  cCount: number | null;
  cpCount: number | null;
  rejCount: number | null;
  beamNo: string | null;
  vNo: string | null;
  vDate: string | null;
};

function fillLineGrid(selected: ThanRow[], maxRows: number) {
  for (let i = 1; i <= maxRows; i++) {
    const r = selected[i - 1] ?? null;
    const setField = (name: string, val: string) => {
      const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setField(`line_t_sr_${i}`, r?.mm ?? "");
    setField(`line_len_${i}`, r?.totalCount != null ? String(r.totalCount) : "");
    setField(`line_a_${i}`, r?.aCount != null ? String(r.aCount) : "");
    setField(`line_b_${i}`, r?.bCount != null ? String(r.bCount) : "");
    setField(`line_c_${i}`, r?.cCount != null ? String(r.cCount) : "");
    setField(`line_cp_${i}`, r?.cpCount != null ? String(r.cpCount) : "");
    setField(`line_rej_${i}`, r?.rejCount != null ? String(r.rejCount) : "");
  }
}

export function DesignThansFill({ lineRows }: { lineRows: number }) {
  const [thans, setThans] = useState<ThanRow[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [lastDesign, setLastDesign] = useState("");

  const selected = thans.filter((t) => t.mm && !removed.has(t.mm));

  const fetchThans = useCallback(async (designNo: string) => {
    if (!designNo.trim()) { setThans([]); setRemoved(new Set()); setLastDesign(""); return; }
    setLoading(true);
    try {
      const res = await fetch(`/inventory/grey-despatch/thans?designNo=${encodeURIComponent(designNo)}`);
      const data: ThanRow[] = await res.json();
      setThans(data);
      setRemoved(new Set());
      setLastDesign(designNo);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t?.name !== "design_no") return;
      clearTimeout(timer);
      timer = setTimeout(() => fetchThans(t.value), 600);
    };
    document.addEventListener("input", onInput, true);
    return () => { document.removeEventListener("input", onInput, true); clearTimeout(timer); };
  }, [fetchThans]);

  useEffect(() => {
    if (lastDesign) fillLineGrid(selected, lineRows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removed, thans, lineRows]);

  if (!thans.length && !loading) return null;

  return (
    <div style={{ border: "2px solid #000", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px", background: "#0f172a", color: "#fff" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Production Thaans — {lastDesign} &nbsp;·&nbsp; {selected.length} selected / {thans.length} total
        </span>
        {loading && <span style={{ fontSize: 11 }}>Loading…</span>}
      </div>
      <div style={{ overflowX: "auto", maxHeight: "28vh", overflowY: "auto" }}>
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fefce8" }}>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000" }}></th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000" }}>MM/Than Sr#</th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000", textAlign: "right" }}>Total</th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000", textAlign: "right" }}>A</th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000", textAlign: "right" }}>B</th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000", textAlign: "right" }}>C</th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000", textAlign: "right" }}>CP</th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000", textAlign: "right" }}>Rej</th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000" }}>Beam#</th>
              <th style={{ padding: "2px 6px", borderBottom: "1px solid #000" }}>Prod V.No</th>
            </tr>
          </thead>
          <tbody>
            {thans.map((t) => {
              const isRemoved = t.mm ? removed.has(t.mm) : false;
              return (
                <tr key={t.mm ?? ""} style={{ opacity: isRemoved ? 0.35 : 1, background: isRemoved ? "#fee2e2" : undefined }}>
                  <td style={{ padding: "1px 4px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!t.mm) return;
                        setRemoved((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.mm!)) next.delete(t.mm!); else next.add(t.mm!);
                          return next;
                        });
                      }}
                      style={{ color: isRemoved ? "#16a34a" : "#dc2626", fontWeight: 700, background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "0 2px" }}
                    >
                      {isRemoved ? "+" : "✕"}
                    </button>
                  </td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace", fontWeight: 700 }}>{t.mm}</td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace", textAlign: "right" }}>{t.totalCount ?? "-"}</td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace", textAlign: "right" }}>{t.aCount || ""}</td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace", textAlign: "right" }}>{t.bCount || ""}</td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace", textAlign: "right" }}>{t.cCount || ""}</td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace", textAlign: "right" }}>{t.cpCount || ""}</td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace", textAlign: "right" }}>{t.rejCount || ""}</td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace" }}>{t.beamNo ?? "-"}</td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace" }}>{t.vNo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {thans.length > lineRows && (
        <div style={{ padding: "3px 10px", fontSize: 10, color: "#b91c1c", background: "#fef2f2", borderTop: "1px solid #fca5a5" }}>
          {thans.length} thaans found but only {lineRows} line grid rows available — increase LINE_ROWS or remove some thaans.
        </div>
      )}
    </div>
  );
}

export function CountGridFiller({
  contractRows,
  rows = 5,
}: {
  contractRows: Record<string, CountRow[]>;
  rows?: number;
}) {
  useEffect(() => {
    const fill = (contNo: string) => {
      const src = contractRows[contNo];
      if (!src || !src.length) return;
      for (let i = 1; i <= rows; i++) {
        const r = src[i - 1];
        if (!r) break;
        const setIfEmpty = (name: string, val: string) => {
          const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
          if (el && !el.value && val) {
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        };
        setIfEmpty(`uc_code_${i}`, r.count ?? "");
        setIfEmpty(`uc_cal_${i}`, r.calCount != null ? String(r.calCount) : "");
        setIfEmpty(`uc_ends_${i}`, r.ends != null ? String(r.ends) : "");
        setIfEmpty(`uc_rate_${i}`, r.ratePerLbs != null ? String(r.ratePerLbs) : "");
        setIfEmpty(`uc_wt_${i}`, r.wtPerMtr != null ? String(r.wtPerMtr) : "");
        setIfEmpty(`uc_cost_${i}`, r.costPerMtr != null ? String(r.costPerMtr) : "");
      }
    };
    const onCombo = (e: Event) => {
      const d = (e as CustomEvent).detail as { name?: string; value?: string };
      if (d?.name === "conv_cont_no") fill(d.value ?? "");
    };
    document.addEventListener("combobox:change", onCombo);
    return () => document.removeEventListener("combobox:change", onCombo);
  }, [contractRows, rows]);
  return null;
}
