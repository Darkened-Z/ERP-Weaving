# Rebuild Patterns — SK Mills ERP

Everything we learned rebuilding 90+ Oracle Forms into Next.js 16. **Read this before writing a new page or fixing a workflow.** Each rule below cost us at least one round of rework, so following it saves time even when you disagree with it.

---

## 1. Voucher numbering (get this wrong once and books diverge)

**Auto V.No = MAX(vNo)+1 inside the save transaction, with UNIQUE fallback that redirects `?error=code_exists`.** Never compute outside the tx (race).

**LV.No display = MAX(vNo) — the LAST SAVED number, not `count(*)+1`.** Oracle: `select (nvl(max(vno),0)+1)-1 into :FRM_LVNO`. The `count(*)` shortcut collides after any delete and shows the wrong number to operators who read it as "the voucher I just saved".

**lContNo (contract local no) = coalesce(max(l_cont_no), 0) + 1 inside the tx.** Same race + delete-collision reasoning. Do not trust a posted read-only lContNo from the form — re-derive on the server.

**Voucher lists scoped to fiscal year.** `eq(transMain.fyCode, currentFy)`. Without it, old-FY vouchers with restarted V.No numbers duplicate visibly in the list.

---

## 2. Party / account pickers

**Only `chartOfAccounts` rows with `level >= 4` are selectable as a party.** Levels 1–3 are group heads (`Assets`, `Cash`, `Debtors` etc.) that must never appear in a picker — posting to them corrupts the trial balance and Oracle's LOVs explicitly filter `CH_LVL = 5` (their leaf level, our 4+).

**Use `Combobox` for header account pickers with `descTargetId` mirroring** the description into a read-only Tittle field. Never use a plain `<datalist>` for accounts — users type free prose and it gets stored.

**Use plain `<input list="…">` datalist for per-row account/count pickers inside a table.** `Combobox` in a row won't trigger `RowAutoFill` (see §5).

**Store the party the same way it currently appears** in the target column. Some tables store `partyCode` (dotted code), some store the description. Check with a `SELECT DISTINCT` before switching to be sure, and translate consistently with `descByCode[]` if the column is a code but you want to display the description.

---

## 3. Unit conversions (the "why is my number off by 100×" bugs)

**Yarn:**
- Rate is per-lbs, qty is in bags. `1 bag = 100 lbs`.
- Line lbs = `bag × 100` (default when empty)
- Contract amount = `qtyBags × ratePerLbs × 100` — the `×100` is not optional
- Voucher line amount = `lbs × rate` (no ×100 because lbs is already lbs)

**Grey:**
- Amount = `(qtyMtr + extMtr) × ratePerMtr` — you MUST add extension meters or every contract is short
- Oracle: `GC_AMOUNT := (nvl(:GC_QTY_MTR,0) + nvl(:GC_QTY_MTR_EXT,0)) * nvl(:GC_RATE_PERMTR,0)`

**Grey Conversion costing chain (both external and internal contracts):**
- Row wt/mtr = `round((ends × 1.0936 / 800) / calCount, 6)` — divisor **800** for conversion
- Row cost/mtr = `round(wtPerMtr × ratePerLbs, 4)` — wt is already in lbs/mtr, do NOT divide by 2.2046
- Header wt/mtr = warp sum + weft sum
- convRatePerMtr = `ratePerPick > 0 ? round(ratePerPick × pick + costLakhaiBorderMtr, 4) : round(rateMtr + costLakhaiBorderMtr, 4)`
- grayRatePerMtr = `round(costPerMtr + convRatePerMtr, 2)`
- Per-40m weights = per-mtr × 40

**Warping contract (different!):**
- Row wt/mtr = `round(((ends × 1.0936 / 840) / calCount) / noOfWidth, 6)` — divisor **840** and divide by width count

**Yarn carton weights:**
- netLbs = `round(netKgs × 2.2046, 3)`

**Grey kachi/godown EL/BAD meter formula:**
- `elMeter = round(meter × elCumiNum / (elCumiDen == 5 ? 400 : 800))`
- `netMeter = meter − elMeter − kamiMtr` — kaat is a MONEY deduction, never a meter deduction
- Money side: `kaatAmt = round(netMeter/40 × kaatPercent)`, `checkeryAmt = round(netMeter × checkery)`, `commissionAmt = round(netMeter × rate × commission/100)`

---

## 4. Component contracts (which one fires what)

| Component | Watches on | Fires when | Use for |
|---|---|---|---|
| `Combobox` | — | user picks / types then blurs; dispatches `combobox:change` CustomEvent | header pickers (party, broker, contract, gray code) |
| `AutoFill` | `combobox:change` document event | Combobox pick with matching `watch` name | header-scope auto-fills (contract → party+broker+brokerage) |
| `RowAutoFill` | native `change` event with capture | `<input list=…>` selection or select blur inside a `<tr>` | row-scope fills in a line grid |
| `RowCalc` | native `input` event with capture | any watched cell in the row changes | live row math (qty × rate = amount) |
| `AutoAmount` | native `input` on named fields | either qty/rate changes; form-scoped | header amount computed from header qty/rate (supports `qty2` and `factor`) |
| `TermSelect` | — | user toggles CASH/DUE | ships the conditional Due Date field |

**Critical wiring gotcha:** `RowAutoFill` listens on native `change`. A `Combobox` inside a row updates its hidden input via React state, which does NOT fire a native `change`. Result: row pickers **must be** `<input list=…>` datalists, not Comboboxes. Use Combobox for header only.

---

## 5. Save action structure (copy this shape verbatim)

```typescript
async function saveVoucher(formData: FormData) {
  "use server";
  const session = await requireSession();
  const id = intOrNaN(formData.get("id"));
  const vDate = txt(formData.get("v_date")) || today();

  // Period lock (if applicable)
  try {
    await assertPeriodOpen(vDate, "FINANCE");
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Period locked")) {
      const thru = /through (\S+)/.exec(err.message)?.[1] ?? "";
      redirect(`/finance/cr?error=period_locked&thru=${thru}`);
    }
    throw err;
  }

  // Extract + validate; redirect ?error=slug for every failure mode
  const party = txt(formData.get("party"));
  if (!party) redirect(`?error=party_required`);

  // Server-authoritative recompute (NEVER trust hidden computed fields from client)
  const amount = qtyBags * ratePerLbs * 100;

  // Line rows: drop empties, keep partial-valid
  const validLines: LineIn[] = [];
  for (let i = 0; i < rowCount; i++) {
    const l = extractLine(i);
    if (isRowEmpty(l)) continue;
    validLines.push(l);
  }
  if (!validLines.length) redirect(`?error=no_lines`);

  const nowIso = new Date().toISOString();

  try {
    if (Number.isFinite(id) && id > 0) {
      await db.transaction(async (tx) => {
        // 1. Reverse OLD side effects (stock, statuses) — read old lines first
        // 2. Update header
        // 3. Delete + reinsert lines (replace-on-update)
        // 4. Apply NEW side effects
      });
      revalidatePath("/route");
      redirect(`/route?id=${id}`);
    } else {
      const newId = await db.transaction(async (tx) => {
        const [{ maxV }] = await tx.select({ maxV: sql<number>`coalesce(max(...), 0)` }).from(...);
        const vNo = provided || nextVNo(maxV);
        const [{ maxL }] = await tx.select({ maxL: sql<number>`coalesce(max(l_cont_no), 0)` }).from(...);
        const lContNo = maxL + 1;
        const inserted = await tx.insert(header).values({ vNo, lContNo, ... }).returning({ id: ... });
        if (validLines.length) {
          await tx.insert(lines).values(validLines.map(l => ({ ...l, voucherId: inserted[0].id })));
        }
        return inserted[0].id;
      });
      revalidatePath("/route");
      redirect(`/route?id=${newId}`);
    }
  } catch (e) {
    const digest = (e as { digest?: string })?.digest;
    if (digest?.startsWith("NEXT_REDIRECT")) throw e;
    const msg = (e as { message?: string })?.message ?? "";
    if (/UNIQUE|constraint/i.test(msg)) redirect(`?error=code_exists`);
    throw e;
  }
}
```

**Gotchas:**
- `redirect()` throws an error with `digest === "NEXT_REDIRECT;…"`. Any outer try/catch **must** re-throw when the digest matches or every redirect becomes a silent failure.
- `revalidatePath` before `redirect` — the redirected page needs fresh data.

---

## 6. Cross-voucher side effects (things that must reverse cleanly)

Every save that touches a shared resource **must** reverse the OLD lines' effect before applying the new. Every delete must reverse. Otherwise stock, statuses, and back-references drift.

| Save touches | Reverse pattern |
|---|---|
| `chartParts.currentStock` (GRN / Demand / Return / Adjustment) | subtract old-line qty impact, add new-line qty impact; on delete just reverse old |
| `beams.statusWrk` (warped-beam LOADED / knotting RUNNING / production EMPTY) | on delete reset to prior status (usually EMPTY); on update recompute from current lines |
| `looms.statusWrk` + `looms.currentBeam` (knotting mounts) | on beam un-mount reset loom to idle |
| `extGodownStockLine.status` = Y/N (kachi parchi consumes godown lines) | on delete/update flip Y → N for the freed lines |
| `extKachiParchi.ppVno` (packi parchi converts a KP) | on delete null the ppVno; on update null OLD kpId's ppVno then stamp NEW |
| `intDailyProductionSet.dlvStatus` = Y/N (grey despatch consumes than serials) | on delete/update flip Y → N for freed serials |
| `transDetail` accounting cross-posts | delete all details for that (fy, vtype, vno) then re-insert per line + contras |

---

## 7. Contra posting rules (finance vouchers)

**One contra row per line** at `srno = 50+i` (CR/PR debit-contra) or `srno = 100+i` (CP/PC/BP credit-contra). Not a single lump — Oracle's cash book relies on the granularity.

**Cheque narration on contra:** ``narration = (lineNarr ?? "") + ` CHQ.#: ${chqNo}${chqDate ? " DT."+chqDate : ""}` `` when chqNo present. Bank reconciliation is impossible without this.

**BR/BP splitting flag:** UNCHECKED → per-line contra as above. CHECKED → single contra at srno 51 with narration concatenating every line's `CHQ.#:{no} DT:{date}`.

**partyCode = header account code on every detail row incl. contras.** Aging reports group by partyCode; forgetting this makes half the vouchers invisible to aging.

**Hide contra rows from the grid** (`srno >= 50` or the debit/credit filter). Users never see or edit them; they exist for the ledger only.

---

## 8. Delete gating

**Every destructive form uses `<ConfirmButton>`** with a message stating what will be reversed.

**Finance vouchers:** delete requires `session.roleName === "ADMIN"` (or per-page override). Non-admins → `?error=admin_only`.

**Masters (accounts, cost centers, parts, weavers, looms):** delete blocked when the record is referenced. Query children (`codeHead = code` OR dotted-prefix match) AND every transaction table that stores that FK. Redirect `?error=in_use`.

**Contract delete:** cascade in a tx — delete all deliveries/lines then the header.

---

## 9. Common mistakes we made (each one shipped, was noticed, then fixed)

1. **`amount = qtyBags × ratePerLbs`** on yarn contracts → every amount 100× too small. Fixed: `× 100`.
2. **`type: "PUR"` hardcoded on insert** → users can't record returns. Fixed: read `formData.get("type")`.
3. **LV.No = `vouchers.length + 1`** → shows wrong number after deletes. Fixed: `max(vno)`.
4. **All `chartOfAccounts` in party datalist** → users select group heads and post to non-postable accounts. Fixed: filter `level >= 4`.
5. **Party datalist storing description** while contract stores code → contract auto-fill fails to match. Fixed: use `descByCode[]` translation both ways.
6. **Beam status default `RUNNING`** on new beam → beams appear as if they're weaving before they even exist. Oracle default is `EMPTY`. Fixed.
7. **"Del Bill" calling `deleteVoucher`** → nukes the whole voucher instead of just clearing bill no/date. Fixed: dedicated `deleteBill` action that only nulls billNo/billDate (copy from warped-beam).
8. **`nowTime()` using `toISOString().slice(11,16)`** → UTC time shown as local. Fixed: local Intl formatter.
9. **UTC date arithmetic** (`d.setDate(getDate()+n)`) → off-by-one on negative-offset servers. Fixed: `setUTCDate(getUTCDate()+n)` OR `Asia/Karachi` Intl.
10. **`try/catch` that swallowed `redirect()`** → every error banner showed "unexpected error". Fixed: re-throw when `err.digest?.startsWith("NEXT_REDIRECT")`.
11. **Combobox in table row + RowAutoFill** → RowAutoFill silent because Combobox uses custom event. Fixed: use datalist inside rows, Combobox only for header.
12. **Nested `<form>` tags** for inline OK/Clear-OK buttons → invalid HTML. Fixed: `formAction={setOkStatus}` + `formNoValidate` on submit buttons inside the outer form.
13. **Persisting stale user-entered stock values** → later renders show wrong numbers. Fixed: always compute stock at read time (`Σ receipts − Σ issues`); never store.
14. **Missing `partyCode` on contra rows** → aging report misses half the vouchers. Fixed: `partyCode = headerAccCode` on every detail row.
15. **Datalist for account pickers on finance vouchers** → typos and free prose stored as account codes. Fixed: `Combobox` with `descTargetId` mirroring Tittle.
16. **No FY scoping on CR/CP voucher lists** → old-FY vouchers with restarted V.No numbers appear as duplicates. Fixed: `eq(fyCode, currentFy)`.
17. **`lContNo = existingRows.length + 1`** at insert time → collides after any delete. Fixed: `coalesce(max(l_cont_no), 0) + 1` inside the tx.
18. **Ignoring ±5% delivery tolerance** on contract lines → users over-deliver by 20% and only find out in the ledger. Fixed: pre-commit check redirects `?error=qty_tolerance`.
19. **Weave field defaulting `""` on new grey contracts** → Oracle default was `"1/1"`; users have to retype it every time. Fixed.
20. **Storing text into an INTEGER column** (SQLite dynamic typing works but is a landmine) — the grey-despatch line uses `tSrNo INTEGER` for `mmThanSrNo` values like `AUG-14-25`. **TODO**: migrate `tSrNo` to `TEXT`.
21. **Exporting `buildCostCenterOptions` from `page.tsx`** → not a blessed Next.js pattern. **TODO**: move to `options.ts`.
22. **Not maintaining `chartParts.avgCost` on GRN update** — reversing old and reapplying new isn't reconstructible exactly. Documented simplification: reverse qty only, recompute avgCost fresh for the new lines. Acceptable per spec but worth flagging on any store audit.

---

## 10. Testing checklist for a new page

Before considering a page done, verify in the browser:

- [ ] Add a new record — auto-code fills, LV.No shows previous max
- [ ] Save with a missing required field → banner appears with the right message
- [ ] Edit existing record — all fields prefilled correctly, saved values persist
- [ ] Save a duplicate code → UNIQUE catch → `?error=code_exists` banner
- [ ] Delete confirms via ConfirmButton
- [ ] Delete when referenced by a transaction → `?error=in_use` (masters only)
- [ ] Delete cascades correctly (header voucher — child lines + side effects reverse)
- [ ] Party picker shows only level 4+ accounts
- [ ] Contract picker is scoped to selected party (where applicable)
- [ ] Line row auto-fills (RowAutoFill from a datalist or count picker)
- [ ] Live math fields update as you type (AutoAmount / RowCalc)
- [ ] Term = DUE reveals the Due Date field
- [ ] OK / Clear-OK buttons actually flip `statusOk`
- [ ] Period lock (when locked): save blocked with `period_locked` banner
- [ ] Print button opens the browser print dialog and hides `.no-print` elements
- [ ] LV.No display shows the LAST saved number, NOT a `count(*)+1`
- [ ] Row 0 (all-empty) is dropped on save silently
- [ ] Editing a row and re-saving doesn't self-deduct from stock/tolerance/etc.

---

## 11. Schema conventions

- Money: `real("amount")` (SQLite has no decimal type; guard rounding at write time)
- Dates: `text("v_date")` in `YYYY-MM-DD` format, sorted lexicographically
- Timestamps: `text("posted_date")` as ISO 8601 (`new Date().toISOString()`)
- Boolean-ish flags: `text("status")` with named values (`R/A/C` or `Y/N`) — never `integer` 0/1 (breaks Turso serialization sometimes)
- Cascade deletes: `.references(() => parent.id, { onDelete: "cascade" })`
- Auto-numbered PKs: `integer("id").primaryKey({ autoIncrement: true })`
- Composite uniques via `uniqueIndex(...)` in the second-arg callback

---

## 12. Deployment

- Local DB: `data.db` (file-based, dev only)
- Prod DB: Turso (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in `.env.turso`)
- Migrations: `migrate-*.mjs` scripts that run both locally then with `--env-file=.env.turso`
- Deploy: `git push origin main` then `vercel --prod --yes` (aliased to `erp-weaving.vercel.app`)
- No AI markers in commits — no `Co-Authored-By: Claude` trailers, no `.claude` dirs in repo
