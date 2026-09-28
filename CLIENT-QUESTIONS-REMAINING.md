# Remaining Questions — Client Se Poochna Hai

---

## 3. Packi Parchi GL — Commission Only

Abhi system mein packi parchi save hone par party ka net position sirf commission ban raha hai.
Matlab: full bill debit hota hai, phir non-commission amount credit ho jata hai — net mein sirf commission bachta hai.

**Sawaal:** Kya yeh theek hai? Ya party ko poora bill owe karna chahiye (commission alag)?

---

## 5. IWB Sizing — Rate/KG Formula + Bill Posting

### a) Rate Per KG Formula
Rate per meter ka formula: `BeamLength × Ends ÷ 1693.20 ÷ Result Count SZG × Rate/Mtr`
Yeh kaam kar raha hai.

**Sawaal:** Jab Rate per KG dein toh amount ka formula kya hoga?
Kya yeh weight-based hai? `Net Weight (Kg) × Rate/Kg`? Ya koi aur formula?

### b) Bill Posting to Sizing Party Ledger
User ne kaha ke total amount sizing party ke ledger mein add hona chahiye, lekin sirf tab jab bill number add karein (sizing bills month ke end par aate hain).

**Sawaal:**
- Bill number DEL BILL section mein jo "BILL NO" field hai — wahi hai?
- Ledger mein kaunsa account DEBIT hoga aur kaunsa CREDIT?
  - Debit: BM SALE PARTY (WARPING SIZING EXPENSES)?
  - Credit: BEAM RECEIVING FROM party (e.g. Bagad Sizing)?

### c) GST Posting
Abhi GST OUTPUT tax use ho raha hai.

**Sawaal:** Kya yeh INPUT tax hona chahiye? (Sizing service receive kar rahe hain, sell nahi kar rahe.)

---

## 7. Grey Stock Report — DONE (DATA PENDING)

Client ne bataya:
- Grey purchase = real stock
- Packi parchi mein jo sale ho wo minus karo
- Baqi stock dikhao — value, quality, godown ke saath
- Sab kuch ana chahiye

**Status:** Summary report page built at `/external/reports/grey-stock/summary`.
Groups by quality + godown, shows purchased/sold/remaining stock + value.
Linked from main Grey Stock page.
NOTE: `ext_godown_stock` and `ext_packi_parchi` tables currently have 0 rows —
report will populate when data entry starts.

---

## 8. Packi Bill — Piece Grid

Piece grid sirf printed bill par dikhta hai (`/packi-parchi/[id]/bill`).
Sirf tab bharta hai jab parchi mein KP number ho jo godown stock se match kare.
Bina KP ke grid khali rehta hai.

**Sawaal:** Kya bina KP ke bhi piece grid mein kuch show hona chahiye? Agar haan toh data kahan se aayega?

---

## Cash Receipt Issue — FIXED

"Sami sab conv 2026" party ka cash receipt (CR voucher) dala hai lekin conversion ledger mein credit nahi dikh raha tha.

**Root cause:** Conv ledger party picker sirf `ext_packi_parchi.sale_party` se parties lata tha.
Sami ke koi packi parchis nahi the, isliye dropdown mein show nahi hota tha.

**Fix:** Party picker ab `trans_detail` se bhi parties lata hai — agar kisi party ke
finance entries (CR/CP/BR/BP/JV) hain against 1.01.01.* COA codes, toh wo
dropdown mein dikhega chahe packi parchi na bhi ho.
