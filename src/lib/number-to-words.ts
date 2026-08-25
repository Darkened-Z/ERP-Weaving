// Convert a numeric amount to English words in Pakistan-style lakhs/crores
// notation. Handles up to 999,99,99,99,999 (999 arab). Rounds paisas to 2
// decimals: "Rupees One Lakh Fifty Thousand and Fifty Paisas only".

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return TENS[t] + (u ? " " + ONES[u] : "");
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return ONES[h] + " Hundred" + (rest ? " " + under1000(rest) : "");
}

function chunk(n: number): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(under1000(crore) + " Crore");
  if (lakh) parts.push(under1000(lakh) + " Lakh");
  if (thousand) parts.push(under1000(thousand) + " Thousand");
  if (n) parts.push(under1000(n));
  return parts.join(" ");
}

export function numberToWords(amount: number | null | undefined, currency = "Rupees"): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs);
  const paisas = Math.round((abs - rupees) * 100);
  const rupeeWords = rupees === 0 ? "Zero" : chunk(rupees);
  let result = `${currency} ${rupeeWords}`;
  if (paisas > 0) {
    result += ` and ${chunk(paisas)} Paisas`;
  }
  result += " only";
  return neg ? "Minus " + result : result;
}
