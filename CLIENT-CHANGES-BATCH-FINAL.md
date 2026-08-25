# SK Mills ERP — Nayi Tabdeeliyan (Client Verify List)

Server: **https://erp-weaving.vercel.app**
Test se pehle **Ctrl+F5** press karein tazaa version load karne ke liye.

Har item me: **Kahan check karein → Kya check karna hai → Oracle wala pattern**

---

## 1. Company Profile Setup (SIRF Admin)

**Location:** Settings → Company Profile
**Check karein:**
- Company Name, Address, Phone, Email, **NTN, GST No.** likh sakte hain
- Sab print pages me automatic dikhega header par
- Save karne ke baad Kachi Parchi / Yarn Purchase / Warped Beam ka print kholein — upar company info aayegi

---

## 2. Posting Accounts (Admin Only) — Bohat aham

**Location:** Settings → Posting Accounts
**Purpose:** Har voucher (Grey Sale, Yarn Purchase, Knotting, etc.) jab save hota hai to General Ledger me kaunse account codes debit/credit hone chahiye — woh yahan set hote hain. Oracle me bhi yeh hi cheez `SAVE_ACC` function me hardcoded thi.

**Default codes seed ho chuke hain (Oracle wale):**
- Grey Sale Income: 5.01.01.01.0001
- Yarn Sale: 5.01.01.01.0005
- Yarn Purchase Stock: 7.05.01.01.0020
- Knotting Expense: 7.01.06.01.0001
- Sarning Expense: 7.01.06.01.0002
- Maroori Expense: 7.01.06.01.0003
- Warping/Sizing Expense: 7.05.01.01.0047
- GST Output: 5.01.01.05.0005
- Further Tax: 5.01.01.01.0002
- Parts Stock: 1.01.25.16.0001
- Parts Consumption: 7.01.07.01.0006

**Kaise use karein:** Agar aap ke chart me alag codes hain to yahan se change kar dein, save karein — us ke baad har voucher naye codes par post hoga.

---

## 3. General Ledger Cross-Posting — Oracle SAVE_ACC parity

Yeh sab se bara change hai. Ab **10 vouchers** save karne par khud-ba-khud General Ledger me entry ho jaati hai. Pehle sirf voucher ka data save hota tha, GL me alag manually JV daalna parta tha.

**Check karne ka tareeka:**
1. Har voucher save karein
2. Phir General Ledger → Cross-Ledger Report kholein
3. Us tareekh par jaayein — voucher ka DR/CR complete dikhega

### Vouchers with GL Auto-Post:

| Voucher | Debit | Credit |
|---------|-------|--------|
| Grey Despatch (GDP) | Party | Grey Sale + GST + Further |
| Grey Despatch Dami | Party | Grey Sale + GST + Further |
| Yarn Purchase (YPV) | Yarn Stock | Party |
| Yarn Sale (YSV) | Party | Yarn Sale Income |
| Knotting Bill (KB) | Knotting/Sarning/Maroori (bill type ke hisaab se) | Party |
| Warped Beam Bill (EXT) | Warping/Sizing Exp + GST | Party |
| Packi Parchi (GPV) | Party (sale amount) | Commission + Party diff |
| Store GRN (PV) | Parts Stock | Supplier |
| Store Demand (SV) | Parts Consumption | Parts Stock |
| Store Returns (SR) | Parts Stock | Consumption |

**Aham baat:** Agar voucher update ya delete kiya to purani GL entry khud saaf ho jayegi, nayi ban jayegi. Manually kuch nahi karna.

---

## 4. Naye Print / Chalan Pages (8 pages)

Sab pages me: Company header, party info, voucher details, **amount in words** (Rupees Lakh format), 3 signature line (Prepared By / Checked By / Authorized).

**Kahan milega:**
- Yarn Purchase → voucher select → **Print** button
- Yarn Sale → voucher select → **Print** button
- Kachi Parchi → voucher select → **Print**
- Packi Parchi → voucher select → **Print**
- Knotting Bill → voucher select → **Print**
- Warped Beam Bill → voucher select → **Print**
- Reports → Grey → **Delivery Order (Tax)** — commercial invoice with NTN + GST
- Bank Payment → BP voucher → **Cheque Print** — pre-printed cheque paper par direct print (Bank name auto, date position, amount in words, payee — sab set)

---

## 5. Contract Print Pages (5)

**Formal legal-document format** — buyer/seller blocks, terms text, delivery schedule, grand total in words, dual signature.

**Kahan milega:**
- External → Contracts → Yarn Purchase → contract kholein → Print
- External → Contracts → Yarn Sales → Print
- External → Contracts → Grey Purchase → Print
- External → Contracts → Grey Sales → Print
- External → Contracts → Grey Conversion → Print

---

## 6. Naye Missing Reports (7)

Yeh reports Oracle me thi lekin naye system me nahi thi — ab dobara mil gayi hain:

| Report | Kahan |
|--------|-------|
| Knotting Bill Register | Reports → Weaving → Knotting Bill |
| Grey Conversion Bill (KP/PP) | Reports → Grey → Conv Bill KP-PP |
| Packi Parchi Bill / Register | Reports → Grey → Packi Parchi Bill |
| Yarn Sale Register | Reports → Yarn → Sale Register |
| Loom RPM Average | Reports → Weaving → Loom RPM Avg |
| Missing Audit / Supervisor QA | Reports → Weaving → Missing Audit |
| Empty Beam Stock | Reports → Weaving → Empty Beam Stock |
| **Project / Job Costing** | Reports → Finance → Project Costing (cost-center rollup) |

---

## 7. Voucher Approval Pipeline (Store → Audit → Finance)

**Purpose:** Store se seedha GL me post nahi hoga. Pehle Auditor check karega, phir Finance user post karega.

**3 status:**
- **STORE** — Store Incharge ne banaya, ab Auditor ke paas hai
- **AUDITED** — Auditor ne pass kar diya, ab Finance ke paas
- **POSTED** — Finance user ne GL me post kar diya (yeh permanent, sirf Admin revert kar sakta hai)

**Kaise use karein:**
- Store voucher save karo → status **STORE** hoga aur badge dikhega
- Login as Auditor → Store voucher kholo → **Forward to Finance** button
- Login as Finance/Accountant → voucher kholo → **Post to GL** button
- Login as Admin → **Revert** button (agar galat post ho gaya)

**Applies to:** Store GRN, Store Demand, Store Return, Store Adjustment

**Approval queue kahan?** Nav bar me nayi link: **My Queue** — 3 section (STORE/AUDITED/POSTED) me apne kaam ki cheezein dikhati hai.

---

## 8. Naye Features (Extra)

- **Settings → Backup** — "Download Snapshot" button — poori database ka JSON snapshot download hoga (backup ke liye)
- **Store → Parts Profit** — bulk margin/price update — ek % dalein, sab parts ke rates update ho jayenge
- **Chart of Accounts print** — top par filter: All / Receivable only / Payable only
- **Store Stock report** — location dropdown filter (kis warehouse ka stock chahiye)
- **Yarn Purchase Contract History** — status filter: All / Open / Consumed / Closed
- **Weaving Counts Accounts** (3 variants) — WARP-only / WEFT-only / All toggle
- **Yarn Stock report** — "Show negative only" toggle (kaunse yarns me short hai)

---

## 9. Choti Choti Fixes

- Kachi Parchi print me bill calculation clean kar diya (Conv Amount + Grey Amount + Grand Total sirf)
- Delivery Order Tax report me GST calculation ki formula fix ki
- Har finance voucher (CR/CP/BR/BP/JV/PR/PC) me ab **Print** button seedha `/reports/gpv` par jaayega (jaisa Oracle me tha) — pehle browser ka print dialog open hota tha jo galat lagta tha

---

## 10. Test karne ki priority (aap ke liye)

**Sab se pehle yeh 5 test karein:**

1. **Settings → Company Profile** — apni company details, NTN, GST bhar dein, save karein
2. **Settings → Posting Accounts** — codes verify karein aap ke chart of accounts se match karte hain
3. **Yarn Purchase Voucher** ek naya voucher banayein → save → phir **General Ledger → Cross-Ledger** report me dekhein automatic entry aayi
4. **Grey Despatch Voucher** — same test
5. **Store GRN** save karein → Auditor login se **Forward to Finance** press → Finance login se **Post to GL** — end-to-end approval flow

Agar yeh 5 test theek chal jayein to poora system Oracle ke barabar hai.

---

## Puraani baaton ka status

| Feature | Status |
|---------|--------|
| Grey Conversion — Gray Qlty Code se WARP/WEFT count auto fill | ✅ Done (pichhle batch me) |
| WARP/WEFT count se Desc + Brand auto | ✅ Done |
| Yarn Contract — descShort + full name split (FAZAL style) | ✅ Done |
| Code + Name saath dikhana | ✅ Done sab jagah |
| PDF download har jagah Excel ke saath | ✅ Done |
| Density / scrolling minimize | ✅ Done — sab entry forms 1 screen me fit |
| Party lookup = level ≥ 4 only | ✅ Done |
| Roman Urdu client summaries | ✅ (yeh file) |

---

**Deploy live:** https://erp-weaving.vercel.app
**Latest commit:** `3cc8c4c` on `main`
**Testing tareeka:** Ctrl+F5 press karein, phir upar diye 5 tests karein.

Koi problem aaye to screenshot bhejein, message karein — foran fix karenge.
