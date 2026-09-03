# Daily Production (WVG) — Oracle-parity plan

Planning notes + checklist for wiring `inventory/daily-production` to match the
Oracle DAILY PRODUCTION (WVG) workflow. **No code yet — this is the spec.**

## The Oracle workflow (as described by owner)

After the knotting bill mounts a beam on a loom (LOADED → RUNNING), production is
entered here:

1. **Date** + **Shed** chosen. Folding/holding grey stock auto-accumulates.
2. Pick the **Grey Conversion Contract** — LOV lists all contracts with their
   description / quality / branding (warp, weft) / party. Selecting fills those.
3. **F9 on Loom** opens a LOOM LIST — **filtered to the chosen shed only** (that
   shed's machines, no others). Pick the loom you're producing on.
4. Picking the loom auto-brings that loom's **mounted contract + beam** (from the
   knotting mount): the SET NO LIST info — Beam Set No, Set No, Kn.Date, Type
   (SZG), Beam No, Set Status (FRESH), Status Wrk (RUNNING), Ends, Beam Length,
   Kn.VNo, BM.Rcv.VNo, Cont No.
5. **Beam Status** F9 = STATUS LIST: F-ROLL, L-ROLL, R-CUT, RE-KNOT, RUNNING.
   On **first roll (F-ROLL)** you record how much **waste** came off (Wast WT KG).
6. The pick **auto-fills** Beam Length, Ends and the derived columns from image 7:
   **Rcvd Mtr, Diff, Shrinkage** (already computed live).

## What already exists (current page)

- Schema is complete: `int_daily_production` (header) + `_set` (beam grid) +
  `_detail` (A/B/C prod). Set row already has beamSetNo, setHash(set no), beamNo,
  beamStatus, wastWtKg, ends, bLength, rcvdMtr, diff, shrinkage.
- Header: Date, No (IDP-), Shed (datalist of all sheds), **Folding Stock**
  (auto = Σ produced − Σ despatched, per conv party, readonly), Set#, Design#,
  Grade, Remarks.
- SET grid: A/B/C/CP/PPC → Total (server-authoritative), Rej, Beam Set#, Type
  (K/S/M), Beam Status (`<select>` from `beam_statuses`), Wast WT KG,
  **Beam #** (weak datalist of ALL beams), Ends/B.Length/Rcvd-Mtr/Diff/Shrinkage.
- `ProductionSetCalc` computes Total, Rcvd/Mtr (cumulative), Diff, Shrinkage live.
- `RowAutoFill watch=beamNo` fills ends/bLength/beamSetNo/setHash from the beam.
- PRODUCT (quality Combobox from grey construction, brand, slvag), PARTIES
  (Conv/Beam/Szg party Comboboxes from L5 accounts), Shift incharge, Codes.
- Save applies each row's beamStatus to `beams.statusWrk`; auto last-roll → EMPTY
  when woven meters ≥ beam length; edit reverses dropped beams.
- `beam_statuses` already seeded: EMPTY, F-ROLL, L-ROLL, LOADED, R-CUT, RE-KNOT,
  RUNNING. `int_grey_conversion_contract` has party, designNo, productName,
  productQuality, grayQltyCode, width, read, pick, qtyMtr + warp/weft child rows
  (count, descr, brand, ends). Loom→contract/beam link = `looms.currentContract`
  + `looms.currentBeam` (set by the knotting mount); RUNNING beams carry
  `beams.loomNo`.

## Gaps to build (checklist)

- [ ] **1. Loom picker (NEW — biggest gap).** There is no loom field today. Add a
      **Loom#** LOV that lists looms **filtered to the header Shed** (F9 → that
      shed's machines only). Decide placement first (see open Q1).
- [ ] **2. Shed → loom filter.** Loom LOV rows carry `filterKey = shed`; the
      picker's `filterByField = "shedNo"` so only the chosen shed's looms show.
- [ ] **3. Loom pick → auto beam + contract.** On loom pick, auto-fill from that
      loom's RUNNING beam (`beams` where loomNo = picked, statusWrk = RUNNING):
      beam set no, set no, beam no, set status, ends, beam length, kn vno. Surface
      the loom's `currentContract` (Kn.Cont No).
- [ ] **4. Grey Conversion Contract LOV (header).** Replace/augment the plain
      Conv-Cont-Party combobox with a rich contract picker (`int_grey_conversion_contract`
      status=R): columns Cont No · Party · Design · Product/Quality · Width ·
      Read×Pick · Qty. On pick fill Product Quality, Product (Brand from
      warp/weft `brand`), and Conv Cont Party. (Warp/weft branding from the
      `_warp`/`_weft` child rows.)
- [ ] **5. SET NO LIST beam LOV.** Replace the weak Beam # datalist with a rich
      FindingPicker scoped to the loom's RUNNING beam(s): Beam Set No · Set No ·
      Kn.Date · Type · Beam No · Set Status · Status Wrk · Ends · Beam Length ·
      Kn.VNo · BM.Rcv.VNo · Cont No. Pick → RowAutoFill fills the row.
- [ ] **6. Beam Status LOV + first-roll waste.** Status `<select>` already lists
      F-ROLL/L-ROLL/etc. Confirm the F9 LOV feel is wanted; ensure choosing F-ROLL
      makes Wast WT KG the focus/required. (Wast WT KG column already exists.)
- [ ] **7. Auto-fill derived columns** (Beam Length, Ends, Rcvd Mtr, Diff,
      Shrinkage) on the loom/beam pick — extend `ProductionSetCalc` +
      `RowAutoFill` to also trigger after the LOV pick.
- [ ] **8. Folding/holding grey stock.** Confirm whether production must post to
      the FOLDING GREY STOCK godown `1.01.25.01.0037` (GL), or the current
      computed Folding Stock number is enough (see open Q3).
- [ ] **9. Verify end-to-end** on local dev with seeded loom+RUNNING beam+contract
      (knotting mount first), then deploy.

## DECISIONS (locked)
- **Q1 → per-shed, per-row Loom#** (my call): header = Shed + contract; SET grid
  each row gets a shed-scoped **Loom# (F9)** whose pick auto-fills that row's beam.
  Least disruptive to the existing per-beam grid. Adds `int_daily_production_set.loom_no`.
- **Q2 → loom's mounted contract auto-fills** (beam.contractNo → grey conversion
  contract → product quality/brand); header contract pick is the override.
- **Q3 → GL POST** production into FOLDING GREY STOCK godown `1.01.25.01.0037`
  (owner overrode the default). Proposed entry per production voucher:
  **DR `1.01.25.01.0037` (Folding Grey Stock)** / **CR Conv Cont Party** for
  Σ produced meters × contract conversion rate; reverse on grey despatch.
  NEEDS CONFIRM: (a) credit head — conv party vs a conversion-income/WIP head?
  (b) rate basis — `convRatePerMtr` vs `grayRatePerMtr` vs `rateMtr` from the
  grey conversion contract? VTYPE for the posting (e.g. `DP`).

## Open questions (answered above — kept for history)

- **Q1 — One loom per voucher, or many?** Is a Daily Production voucher ONE loom
  (loom in the header, set grid = that loom's beam) or ONE shed with MANY looms
  (Loom# as a column per set row)? The set grid is per-beam today, so a per-row
  Loom# fits — but the Oracle header shows a single "Looms#". This decides where
  the loom picker lives.
- **Q2 — Contract source.** Header contract pick AND loom-derived contract both
  exist in the flow. When they differ, which wins — the loom's mounted contract,
  or the header pick? (Proposed: loom's `currentContract` auto-fills, header pick
  is the fallback / override.)
- **Q3 — Folding grey stock GL.** Does production need a GL posting into
  `1.01.25.01.0037` (FOLDING GREY STOCK), or is the on-screen Folding Stock
  figure (produced − despatched) sufficient? No GL is posted by this page today.

## Constraints (do not break)

- Reuse `FindingPicker` (F9 LOV, `filterByField` for shed-scoping), `RowAutoFill`,
  `ProductionSetCalc` — do not invent new mechanisms.
- Keep the existing beam lifecycle on save (statusWrk apply, last-roll → EMPTY,
  edit reversal) intact.
- Loom↔beam link comes from the knotting mount (`looms.currentBeam/currentContract`,
  `beams.loomNo` + statusWrk RUNNING) — this plan consumes it, does not change it.
