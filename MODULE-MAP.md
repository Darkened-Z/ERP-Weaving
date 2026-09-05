# Module & Page Changes Map

Single reference for the **deliberate, mill-specific customizations** on each page/module.
Read this before touching a page so nothing already built gets reversed. When you change
a page, update its entry here.

Conventions: quality is keyed by grey-construction **CODE** (e.g. `GC-001`) everywhere.
Client-facing summaries are Roman Urdu; the freelancer works in English. Deploy = push to
`main` (Vercel auto-deploys). No AI markers in commits/repo.

---

## Shared building blocks (use these; don't re-implement per page)

| File | What it gives |
|---|---|
| `src/lib/grey-quality.ts` | `countLabelMap`, `wfPart` (count desc, collapses identical warp/weft), `richConstruction` (reed×pick + warp/weft), `normQuality` (any stored quality → construction code). Used by packi + godown; use in any new grey page/report. |
| `src/lib/coa-heads.ts` | `conversionDebtorPrefixes()` = DEBTORS conversion heads **WVG `1.01.01.01` + COMMERCIAL `1.01.01.19`** (restricted to `1.01.01.*` so the creditor `3.03.20.01` CONVERSION head is excluded); `underAnyPrefix()`. Any "conversion party" picker filters on these — real parties like "Sami sab conv 2026" live under COMMERCIAL. |
| `src/lib/gl-accounts.ts` | `acc(key)` posting-account resolver + `PostingKey` enum. Keys incl. `GREY_COMMISSION_INCOME`, `SALE_BROKERAGE_EXP` (=`3.03.25.03.0003`), `YARN_PURCHASE_STOCK`, `YARN_SALE_INCOME`, `WARPING_SIZING_EXP`, `GST_OUTPUT`. |
| `src/lib/db-errors.ts` | `isUniqueViolation(e)` → friendly "already exists" on duplicate keys. |
| `src/components/finding-picker.tsx` | F9 LOV picker. Now **keyboard-reachable** (Enter/F9 opens it; `data-lov-picker`). |
| `src/components/form-keyboard.tsx` | Global Enter=next / F9=lookup / Ctrl+S=save. Skips readonly inputs EXCEPT `data-lov-picker`. |
| `src/components/auto-fill.tsx` | `AutoFill` (combobox:change → fill combos/inputs), `RowAutoFill`, `RowCalc`. |
| `src/components/qty-bags-lbs.tsx` | Qty Lbs = Qty Bags × 100 (editable). |
| `src/lib/form.ts` | **Shared form parsers + tiny utils**: `num` / `intVal` / `txt`, `nextVNoFromRows(rows, prefix)`, `round(v, d)`, `escLike(s)` (SQL LIKE escaping — every find-filter uses it), `fmtMoney` (en-PK, 2 decimals, blank for null — imported `as fmt` / `as formatNum` where pages used those names). ALL pages import these instead of re-declaring (60+ migrations, byte-identical behavior). New pages: import, don't copy. Page-specific variants (knotting's IKS vNo helper, calculator's 4-digit formatNum, cheque-books' non-null fmt) stay local on purpose. |
| `src/lib/godowns.ts` | `yarnStockGodownDesc(parties)` (resolves the yarn-stock godown by CODE `1.01.25.01.0001`), `godownLocationOpts(parties)` (**GODOWN accounts only** — code `1.01.25.01.*`; sizing / CHQ-FAILED accounts excluded, filter is by CODE not a name match), `partyCountRateMap(parties)` ((party desc‖count code) → party_counts rate for `PartyCountRate`). Used by yarn-receipt, yarn-transfer, warped-beam. |
| `src/components/party-count-rate.tsx` | `PartyCountRate` — watches two Comboboxes (party + count), fills rate inputs from a `"party‖count"`-keyed map; `onlyWhenEmpty` for fallback fills. |
| `src/lib/conv-contracts.ts` | `loadConvContracts()` — running grey-conversion contracts from **BOTH** `int_grey_conversion_contract` (IGCC-) **and** `ext_grey_conv_contract` (GCC-), unified (contNo, party, quality, rates, first warp brand, `source`). **The mill's live contracts are external**, so every conv-contract picker (daily production, grey despatch, folding-stock report) MUST use this — reading only the internal table leaves the picker empty. cont_no prefixes differ so no collisions. |

---

## Grey — Godown Stock (`external/grey/godown-stock`)
- **Purchase Party** = supplier (kept). **Gdn Party** auto-locked to the grey-stock godown `1.01.25.15.0001` ("Godown - Grey Stock Treading").
- Godown is **total-wise** (total Than + Meter), NOT than-by-than. Than-entry grid removed (final).
- **Rate Purchase** = grey rate from contract (editable); Rate Sale field removed (hidden `rate_sal` set from grey_sale_rate_disp). Total below rate; Balance → Net Balance.
- **Conv Cont#** (conversion) vs **Grey Sale Cont** (sale) are **one-at-a-time** (picking one clears the other, via GodownCalc).
- Contract pickers show **all parties' running contracts**. Quality field shows construction rich; `dsp_quality` = **CODE** (normalized on save via `gqNormQuality`; never the rich string).
- **GL posting (VTYPE `GDN`, added):** DR grey-stock godown acct / CR supplier, amount = net meter × purchase rate, narration `<than> THAN <mtr> MTR @ rate, <quality> (GREY PURCHASE)`. Only `type==="STOCK"`; delete removes it; delete-of-old-rows is UNCONDITIONAL then re-post if qualifies.
- Line-status edit: `prev.status === "Y" ? "Y" : line.status`.

## Grey — Packi Parchi (`external/grey/packi-parchi`)
- **Standalone** (Kachi Parchi deleted). Purchase Party locked to grey-stock godown. KP optional (null-safe).
- **Quality** dropdown = **in-stock only** (`stockQualityOpts`, balance>0), label `code — <count desc> [than/mtr]`. Stock aggregates by construction CODE (`normQuality`) so the same quality across lots = ONE line. Quality Print = full list. Construction/Print-Construction fields show `richConstruction`.
- Live stock (than/mtr/avg/value, zero-reset moving average) fills on quality pick. Avg = net-amount ÷ net-meter.
- **Sale side, one-at-a-time:** Grey Sale Contract (`conv_cont_no_sale`) + Conversion Contract (`conv_cont_sale2`) mutually exclusive (PackiCalc onCombo). Rich FindingPicker LOVs (Cont# · quality · rate · date), filtered by sale party; party does NOT open inside.
- **Contract pick fills** quality + construction + godown stock + meter/than (kachi-style). Conversion contract also **distributes warp/weft counts** into the UPDATE COUNT grid (`ext_grey_conv_warp/_weft`), incl. **Count Desc + Brand column** (persisted: `descr`/`brand` on `ext_packi_parchi_count`); TOT Lbs = wt/mtr × net meter. Consumption totals footer (Warp/Weft/Total Lbs, Total Amount).
- **Grey Sale Contract** carries the sale **Term** (paymentTerm/days) → fills Term Sal; its LOV shows a Term column.
- **Sale money as value+amount pairs:** Rate (grey sale rate, from contract) → Rate Amount (rate×mtr) · Commission (%±) → Commission Amount · Checkery → Checkery Amount · Net Amount. (`kaat_percent_sale` hidden, still in net math.)
- **GL (VTYPE `GPV`):** DR saleParty (greyAmtSal) / CR `GREY_COMMISSION_INCOME` (commission) / CR party (clearDiff) — commission-agent model. Broker pair: DR `SALE_BROKERAGE_EXP` / CR broker acct. Narration `<than> THAN <mtr> MTR @ rate, <quality> (PACKI SALE)` on header + lines. Delete-of-old UNCONDITIONAL then re-post.
- **Do NOT** add naive inventory GL to packi (it's commission-model).
- **Quality display (owner):** Quality + Quality Print comboboxes show the **full construction** (`richConstruction` = reed×pick + warp/weft) — **no `GC-001` code, no doubling**. `stockQualityOpts` value = `normQuality(code)`, label = `richFull(code) · <mtr> mtr`; `qualityOpts` label = `richConstruction(c)`. The separate readonly **Construction** + **Print Construction** display fields were **removed** (redundant — the combobox shows it). Stored `quality`/`quality_print` stay the CODE.

## Grey — Godown ledger narration
- The GDN narration shows the **full construction** (`gqRichConstruction` from the dsp_quality code + count labels), not the `GC-001` code. Falls back to the code/contact quality if no construction row. (Existing pre-fix vouchers keep their old narration until re-saved or data-fixed.)

## Yarn — Receipt (`inventory/yarn-receipt`)
- **Pur.Cont No picker + Conv contract picker read from BOTH int + ext** (`extYarnPurContract` union for purchase, `loadConvContracts()` for conversion) — the mill's live yarn purchase contracts are external (`ext_yarn_pur_contract`). **Pur.Cont No is OPTIONAL** (owner: receipts may arrive without a purchase contract — the old `purcont_required` guard was removed; the picker still auto-fills rate/party/count when used).
- **Trn Type** = RCPT/RETN only. **Party (delivered-from)** = DEBTORS-CONVERSION **WVG head `1.01.01.01.*` ONLY** (`WVG_CONVERSION_PREFIX`; NOT COMMERCIAL — inventory party pickers are stricter than the conversion-contract pickers). **Yarn Party To** DEFAULTS to yarn-stock godown `1.01.25.01.0001` (resolved by CODE — the desc regex alone hits GODOWN - REWINDER first) but is **changeable** (Combobox): options = **GODOWN accounts only** (`1.01.25.01.*` via `godownLocationOpts`; sizing / CHQ-FAILED excluded).
- Count-detail: **Warp Bags + Weft Bags = Total Bags** (server recomputes bags = warp+weft), **Qty Lbs** auto ×100 (editable). **Rate/Lbs auto on Party+Count pick** (`PartyCountRate`): `party_counts` (party, count) rate, else the party's running purchase-contract rate — fills both Rate/Lbs + Rate/Lbs To; picking a purchase contract (F9) also fills them. **Brand** comes from the contract, NOT the count description. **Stock Bage/Lbs** = the count's godown stock (RCPT−RETN) before this voucher.

## Yarn — Internal Transfer (`inventory/yarn-transfer`)
- **Transfer From / Transfer To party** = DEBTORS-CONVERSION **WVG head `1.01.01.01.*` ONLY** (`WVG_CONVERSION_PREFIX`). **Location From** default = yarn-stock godown `1.01.25.01.0001` (resolved by CODE). **Location From + Location To** = **GODOWN accounts only** (`1.01.25.01.*` via `godownLocationOpts`; sizing / CHQ-FAILED excluded) + loom sheds in To. (Prior free-text location history dropped — godowns cover it.)
- **Stock Bage/Lbs + Rate/Lbs** auto from the count's godown stock / avg receipt rate; when the godown has no avg for the count, **Rate/Lbs falls back to the `party_counts` (transfer-from party, count) rate** (`PartyCountRate onlyWhenEmpty`). **Qty Lbs** auto = bags×100. **Amount** auto. **Brand** not auto-filled from count description.

## Inventory — Warped Beam Receiving (`inventory/warped-beam`)
- **Beam Receiving From** = sizing party (`CREDITOR - SIZING COMMERCIAL 3.03.06.02`). **Bm Sale Party** = converting party (`1.01.01.01.*` only). **Beam Stock-Loaded** locked to godown `1.01.25.01.0002`.
- **Sizing Contract** picker = **INVENTORY (int_beam_contract_ext_ws) contracts only, scoped to the selected Bm Sale Party** (converter party, e.g. 786 weaving — filterByField="bmSaleParty"; falls back to the sizing party when a contract has no converter). → **Sizing Rate** → grid rate. **The picked contract PERSISTS** (`sizing_cont_no` column, `migrate-iwb-sizing-cont.mjs`).
- Grid columns removed: Warping cnt No, Empty (KG), Yarn Bms Net LBS, Wt, Length, **Beam Loadd (HR)**. Remaining: Sr# · R.Date · Yarn Lot No · Yarn Brand · Set No · Beam Set No · Beam No · Beam Status · Beam Length · Width · Ends · Rate · Conv · **Amount** · GP NO · Upd. (Amount is near the END.)
- **Amount = Beam Length × Ends (tar) ÷ 1693.20 ÷ Result Count SZG × Rate** — Rate = the ROW's own Rate when typed, else the header Sizing Rate (both client calc + server save). **Result Count SZG is OPTIONAL** — blank ⇒ the ÷RC step is skipped (÷1), the amount still generates (owner call).
- **Total Length + Total Amount** at grid end. Top header "Total Amount" **hidden** (was duplicate).
- **Net Weight** box = (bags Qty×Kgs + cones Qty×Kgs) − packing; × Net Weight Rate = Total → GST = Amt Tot. **Net Weight Rate (Kg) auto** = live avg rate of yarn-stock godown `1.01.25.01.0001` (Σ amount ÷ Σ lbs of RCPT yarn receipts into it, ×2.20462 → per Kg) — recomputed each load, NOT a stored constant; editable, saved vouchers keep their own rate. **GL (VTYPE `EXT`):** DR `WARPING_SIZING_EXP`(+GST) / CR party. Bill No + Bill Date + **Bill Due Date** + Billing Status.
- Delete-of-old GL rows UNCONDITIONAL on edit (then re-post if qualifies).

## Finance — Advance Cheque (`finance/advance-cheque`)
- Advance-cheque lifecycle register. **VTYPE `ADV`**, phase in `trans_main.trnType` = `ISSUE` / `CLEAR` / `BOUNCE`. Each phase = one balanced 2-line voucher; status derived by grouping ADV vouchers on `chqNo` (BOUNCE→bounced, else CLEAR→cleared, else issued).
- **Issue is a multi-line grid** (`issueCheques`): each row = one cheque (party / bank-advance / chq no / date / amount / narration) → posts **one ISSUE voucher per row** so each cheque stays an independent lifecycle unit. Batch validates all rows, dedupes cheque numbers within-batch + against existing ADV issues. Row pickers = datalists (`adv-party-accts` all L≥4, `adv-adv-accts` = `1.01.15.03.*`); `RowAutoFill` fills the title columns.
- **Issue:** Dr Party (`accCode`) / Cr Bank-Advance. Party = any L≥4 acct; Bank-Advance picker filtered to `1.01.15.03.*` (per-bank advance sub-accts). **Cheque No re-usable after BOUNCE** — the dup check compares distinct ISSUE vs BOUNCE vouchers per chqNo (an active/cleared issue still blocks); clear/bounce guards use the same tallies; the register pairs issues↔bounces by vno order so a re-issued number shows ISSUED again (`cheque-register.ts` same rule).
- **Cash with cheque:** each issue line has a **Cash Amt** column — one voucher then posts Dr party (chq+cash) / Cr bank-advance (chq, carries chqNo) / Cr CASH account (cash, NO chqNo, srno 3). Cash acct resolved like CP (descShort `CASH` → desc contains CASH IN HAND → CASH). Lifecycle (clear/bounce) reverses ONLY the advance leg (`loadIssue.amount` = the chqNo-carrying credit). Register lists Chq Amount · Cash · Total.

## Finance — Cheque Books (`finance/cheque-books`)
- Cheque-book master + cheque dashboard (modelled on the client's reference). Tables **`cheque_books`** (name unique, bankAcc, accountNo, prefix, startNo, leaves, status, createdAt) + **`cheque_status`** (chqNo unique, status, note, updatedAt — manual STOPPED/CANCELED/MISSED override). Both created in Turso via raw DDL (additive; `drizzle-kit push` sees no diff).
- Register lives in **`src/lib/cheque-register.ts`** (`loadChequeRegister(descMap)`) — shared by dashboard + print. Outgoing cheques only (ADV/BP/CP); one entry per cheque no from its "origin" line (never the ADV CLEAR/BOUNCE reversal). `derived`: ADV bounce→Returned, ADV clear→Cleared, else Issued. `eff` = derived, but a manual override (Stopped/Canceled/Missed) replaces it **only while derived is Issued** (GL clear/bounce always wins).
- **Dashboard**: 8 counters (Issued/Cleared/Returned/Stopped/Canceled/Missed/Unused/Total), **Upcoming** (eff Issued, chqDate ≥ today) + **Past Due** (< today), and **Flagged & Undated** (manual-status or no-date). Each cheque row has an inline **Change** select (Issued/Stopped/Canceled/Missed → `setChequeStatus`; Issued clears the override).
- **Per-book usage**: leaf n = `startNo..startNo+leaves-1`; "used" if `prefix+n` or bare `n` matches a register cheque no. Usage bar + status tally + Unused. CRUD (create/edit; ADMIN delete); dup name → `error=exists`. **Print** = `finance/cheque-books/[id]/print` (full leaf register, standalone printable, PrintButton).
- Nav: Finance → Cheque Books (`fin-cheque-books`), next to Advance Cheque.
- **Clear:** Dr Bank-Advance / Cr Bank (`1.01.15.02.*`). **Bounce:** Dr Bank-Advance / Cr party dishonour (`1.01.15.04.*` "CHQ FAILLED <party>"). Both guard against double-processing (already cleared/bounced).
- **Re-issue** (on a bounced cheque): opens a fresh ISSUE form prefilled with party+amount, new cheque no. (GL = normal issue; whether to also move from dishonour→advance is an owner call — left as plain re-issue.)
- Delete (ADMIN) removes the issue + its clear/bounce (all vnos sharing the chq no). Postings flow into `/ledger` + `/reports/cheque-status` like other cheque vouchers. Reuses `getSession`, `assertPeriodOpen`, `Combobox`, `ConfirmButton` — same pattern as BP.

## Inventory — Knotting / Maroori / Sarning Bill (`inventory/knotting`)
- The loom-mount operation: pick a LOADED beam + a loom → on **Save** the beam mounts (beam `beams.statusWrk` **LOADED→KNOTTING** with loomNo/shed/knVno; loom `looms.statusWrk`→RUNNING + currentBeam). Edit reverses old lines (beam→LOADED, loom→S) then re-mounts current lines. Delete also reverses. VTYPE `KB` GL: DR expense (`KNOTTING_EXP`/`SARNING_EXP`/`MAROORI_EXP` by Type) / CR party.
- **Beam lifecycle**: LOADED (warped-beam receiving) → **KNOTTING** (this bill) → **PRODUCTION** (daily production applies it on save; legacy RUNNING treated as mounted too). Statuses seeded via `migrate-beam-status-flow.mjs` (run against Turso for prod).
- **Beam-status guard (IWB side)**: warped-beam save/edit/delete **never downgrades a beam that has advanced** past receiving (KNOTTING / PRODUCTION / RUNNING stay untouched — only receiving stamps + set/ends/length refresh). Previously editing an IWB voucher re-forced LOADED and silently broke the knotting mount (beams vanished from Daily Production). The IWB grid's Beam Status cell shows the beam's **LIVE** status, not the stale line value.
- **Party** = knotting-contract party (Combobox from `intKnottingContract` status=R); `AutoFill` fills Rate Per Ends / Rate Per Beam / Type from the contract.
- **Line-item pickers** (both `FindingPicker` LOVs, `RowAutoFill` fills siblings):
  - **Beam # (F9)** = "SET NO LIST" of LOADED beams (`beams` where statusWrk=LOADED); columns Beam No/Set No/Beam Set/Status/Length/Ends/GP(brVno). Pick → fills `beam_set_no`, `set_no`, `beam_length`, `ends`, `beam_status` (readonly col). `beamFillMap` keyed by beamNo.
  - **Lm# (F9)** = LOOM LIST (`looms`, ordered by shed); value **`shed|loomNo`** (loom numbers repeat across sheds — same convention now in Daily Production), columns Shed/Loom/RPM/Status. Pick → fills `shd_hash` (readonly). Save splits `shed|loomNo`.
- **Live Amount + Total** via `src/components/knotting-calc.tsx` (`KnottingCalc`): amount = ends × ratePerEnds (else ratePerBeam per active row), net = amount + ext amt, running Total in `#ks-total`. Server recomputes the same on save (grid amount/net are display).
- **Empty-row guard**: a line saves only if it has beam/set/loom/ends/amount — `issue_date`/`k_date`/`shd_hash` (auto-defaults) alone no longer create blank lines.

## Inventory — Daily Production (`inventory/daily-production`)
- Consumes the knotting mount: a loom's RUNNING beam + its contract flow into production.
- **Header Grey Conversion Contract LOV** (`FindingPicker` name `conv_contract`, rows from `intGreyConversionContract` status=R with warp `brand`): columns Cont No/Party/Design/Product-Quality/Width/R×P/Qty/Brand. `AutoFill` fills `productQuality` + `convContParty` (Comboboxes) + `productBrand` (input).
- **SET grid pickers** (`int_daily_production_set` gained `loom_no` + `cont_no`; both migrated to Turso):
  - **Loom# (F9)** = `FindingPicker` name `loomNo`, **`filterByField="shedNo"`** so only the header shed's looms show (Loom/Shed/RPM/Status/Beam/Contract). Value = **`shed|loomNo`** (loom numbers repeat across sheds); server splits it and stores the loom number. Pick → `RowAutoFill` (watch `loomNo`, `loomFillMap` keyed by `shed|loomNo`) fills that row's `beamNo`, `beamSetNo`, `setHash`(set no), `beamStatus`(RUNNING), `ends`, `bLength`, `contNo` from that loom's mounted beam (`beams` where loomNo+shed, statusWrk=KNOTTING/PRODUCTION/RUNNING).
  - **Beam # (F9)** = "SET NO LIST" `FindingPicker` name `beamNo` over RUNNING beams (Beam Set/Set No/Beam No/Set Status/Wrk/Ends/Length/Cont No). Existing `RowAutoFill watch=beamNo` (`beamFillMap`, now also fills `beamStatus`+`contNo`).
  - **Cont No** readonly cell (persisted `cont_no`).
- Beam Status stays a `<select>` from `beam_statuses` (EMPTY/F-ROLL/L-ROLL/LOADED/R-CUT/RE-KNOT/RUNNING); Wast WT KG column for first-roll waste.
- Existing beam lifecycle on save unchanged (statusWrk apply, last-roll→EMPTY, edit reversal). Folding Stock still computed (produced − despatched).
- **Folding grey stock GL (VTYPE `DP`, vno = production id):** DR `1.01.25.01.0037` (FOLDING GREY STOCK) / CR conv party, amount = Σ (row totalCount × grey-conversion contract rate: `convRatePerMtr` → `grayRatePerMtr` → `rateMtr`). Credit party = header `convContParty`, else the row-contract's party (so a loom-only pick still posts). Delete-before-guard on edit; delete removes DP rows. (Grey-despatch reversal of folding stock = future item.)

## Reports — Daily Folding Stock (`reports/weaving/folding-stock` + `/[cont]`)
- Per grey-conversion contract, grouped by party: **Opening** (prod−desp before `from`) + **Production** (Σ `int_daily_production_set.totalCount` where `set.cont_no` = contract) − **Despatch** (Σ `int_grey_despatch_line.lengthMtrs` where `int_grey_despatch.convContNo` = contract) = **Balance**. From/To filter, party subtotals + grand total.
- **P** link → `/[cont]` drill-down: chronological production + grey-despatch ledger for one contract (Date · V.No · A/B/C/CP · Production · Despatch · Than Sr# · running Balance).
- Nav: Weaving reports → Daily Folding Stock (`w-folding-stock`).

## Inventory — Daily Production: party-cross guard + than serials + rejection
- **Party-cross guard:** on save, every row's beam contract (`set.cont_no` → its party) must share ONE party and match the header Conv Cont Party when set, else `error=party_cross` (prevents a loom whose beam belongs to a different conversion contract/party).
- **Live than serials** (`src/components/than-serial-live.tsx` `ThanSerialLive`): each active SET row (has beam/loom/count) auto-gets the next `MON-NNNN-YY` serial, incrementing per active row, from `thanBase` (server: next number for the current month). Table body id `idp-set-rows`. Only fills blank/auto (data-live) cells; user-typed serials kept; server still regenerates blanks on save.
- **Rejection:** account **`1.01.25.01.0038`** GODOWN - REJECTION GREY STOCK (WVG) created (godown head 1.01.25.01) — ready for GL. Currently rejection is **tracked in the folding-stock report** (Rejection column = Σ `set.rejCount` per contract); no rejection GL yet (owner to confirm the Dr/Cr before posting).
- **Godown accounts added under 1.01.25.01:** `.0037` FOLDING GREY STOCK, `.0038` REJECTION GREY STOCK (both created in Turso + local).

## Contracts (`inventory/contracts/*`, `external/contracts/*`)
- **Grey Conversion (internal, `inventory/contracts/grey-conversion`)**: the EXTERNAL contract form ported verbatim — same fields, calcs (wt/mtr = ends ÷ 731.52 ÷ cal count, conv rate = rate/pick × pick + lakhai, gray rate = cost + conv), pickers (GreyQualityPicker, PartyCountGrid, CountPicker, product fill), print route (`[id]/print`), find filters. Domain bindings only: `int_grey_conversion_*` tables, **IGCC- numbering** (SUBSTR(cont_no, 6)), inventory URLs/nav, **Party** = `conversionDebtorPrefixes` (WVG + COMMERCIAL). Warp/weft grid = 4 rows like external but auto-extends when an older internal contract has rows past srNo 4 (old 9-row grid data preserved).
- **Beam Ext W/S (`beam-ext-ws`)**: Converter Party = `conversionDebtorPrefixes`. **WT/Mtr = Ends ÷ 731.52 ÷ Cal Count** (no width division; matches grey conversion).

## GL posting — the delete-before-guard rule (systemic)
On EDIT, every GL-posting form must **delete old (vtype,vno) rows UNCONDITIONALLY**, then re-post only if it qualifies — otherwise editing a voucher into a non-postable state orphans stale ledger rows. Fixed in: godown (GDN), packi (GPV), yarn-sale (YSV), warped-beam (EXT), grey-despatch (GDP). Yarn-purchase (YPV) was already correct. **grey-despatch-dami posts NO GL** — it must never delete shared GDP rows (was wiping real despatch postings).

## Reports
- **General Ledger `/ledger`** = the Oracle ACCOUNTS LEDGER (WVG): SR# · Date · Type · V.No · Narration · Dr · Cr · Balance, opening + running + closing. Carries the grey/yarn/packi narrations.
- **Weaving Counts Accounts Report `/reports/weaving/count-report`** (+ `/ledger` detail): party × count — Seed (yarn sale voucher) − Consumed (packi count) = Balance, Rate, Amount. The **detail** (`count-report/ledger`) mirrors the Oracle CONV.C# layout: per-contract block header **auto from the ext conv/sale contract** (construction rich, Conv Rate = convRatePerMtr→grayRatePerMtr→rateMtr, Cont Qty) + a second header line with **Ends W/W/T + Lbs/M Wrp/Wft + Rate/Lbs** (actuals from the packi count rows, contract wtPerMtr fallback) → packi rows (V.No + Book No (`ppNo`) / Dying (`printingName`) / Product (`qualityPrint` rich) / C.Cnt Wrp+Wft (calCount) / than / meters / warp / weft / tot / **Resulted Count** / rate / amount) → CONV.C# TOTAL → GRAND TOTAL → **SUMMERY REPORT** footer (Send/Consumed/Balance × Bags(=lbs/100)/Lbs/Rate(seed)/Amount + party banner). **Resulted Count = TOT Lbs × Cal Count ÷ Seed Lbs** (verified vs client report: seed 16000 @ count 36 → divisor 444.4; grand total = Σ).
- **Grey stock** reports (`reports/grey/stock-ledger`, `stock-detail-ledger`, `stock-account-ledger`) + `external/reports/grey-stock/*` + GREY REGISTER (`external/reports/grey-register`, party-wise).
- `reports/weaving/counts-accounts` + `yarn/count-balance`: **Party filter removed** (count-wise reports; party-scoping was semantically broken — party×count lives in count-report).
- Narration conventions: grey `<than> THAN <mtr> MTR @ <rate>, <quality> (GREY PURCHASE|PACKI SALE)`; yarn `<count desc> (<bags>) bags (<lbs>) lbs @ <rate>`.

## Define / Masters
- 13 master forms (weavers, staff, yarn-fibers, do-parties, grey-dsp, chart-define, company-units, cities, beam-status, yarn-brands, yarn-blends, locations, yarn-locations) show a friendly "already exists" on duplicate (via `isUniqueViolation`), not a crash.
- **Grey Construction**: edit no longer nulls the unrendered warp6-8/weft6-8.

## Known caveats / data
- `ext_godown_stock`, `ext_packi_parchi`, `ext_grey_sal_contract` are mostly EMPTY in Turso → reports show "no records" until entries exist; numbers can't be validated yet.
- Conversion contracts present: GCC-0003 (CONV, grey rate 163.45), GCC-0004 (SALE, 173.52).
- Turso creds in `app/.env.turso` (local scripts only; never expose).

## Still open (flagged, awaiting owner)
1. Weaving Counts detail now groups by CONV.C# (done). Remaining polish vs Oracle: per-contract construction/ends header row, Resultant Count + Conv Rate columns (fields undefined — need owner input), and validating numbers once real data exists.
2. **Knotting** edit ↔ loom mount/un-mount workflow (auto re-mount vs manual).
3. Warped-beam amount example (110 vs 100) — owner to verify.
4. **Cheque handling** upgrade (lifecycle states, PDC register, bounce workflow) — scoped, not started.
