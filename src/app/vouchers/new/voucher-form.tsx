"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Line = {
  accCode: string;
  narration: string;
  debit: string;
  credit: string;
};

type Account = { code: string; description: string };

export default function NewVoucherForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [vtype, setVtype] = useState("JV");
  const [vdate, setVdate] = useState(new Date().toISOString().split("T")[0]);
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { accCode: "", narration: "", debit: "", credit: "" },
    { accCode: "", narration: "", debit: "", credit: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const formatNum = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  function updateLine(idx: number, field: keyof Line, value: string) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        if (field === "debit" && parseFloat(value) > 0) return { ...l, debit: value, credit: "" };
        if (field === "credit" && parseFloat(value) > 0) return { ...l, credit: value, debit: "" };
        return { ...l, [field]: value };
      })
    );
  }

  function addLine() {
    setLines((prev) => [...prev, { accCode: "", narration: "", debit: "", credit: "" }]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const validLines = lines.filter((l) => l.accCode && (parseFloat(l.debit) || parseFloat(l.credit)));
    if (validLines.length < 2) {
      setError("At least 2 lines with account codes and amounts required.");
      return;
    }
    if (!isBalanced) {
      setError("Debits and credits must be equal.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vtype, vdate, narration, lines: validLines }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save voucher.");
        setSaving(false);
        return;
      }

      router.push(`/vouchers?type=${vtype}`);
      router.refresh();
    } catch {
      setError("Network error.");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <datalist id="voucher-accts">
        {accounts.map((a) => (
          <option key={a.code} value={a.code}>
            {a.code} — {a.description}
          </option>
        ))}
      </datalist>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`w-56 bg-black text-white flex flex-col fixed h-screen overflow-y-auto z-50 transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold tracking-tight">SK MILLS</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mt-1">
              Weaving Management
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/40 hover:text-white text-xl leading-none cursor-pointer p-1"
          >
            &times;
          </button>
        </div>
        <nav className="flex-1 py-4 px-5">
          <Link
            href="/vouchers"
            onClick={() => setSidebarOpen(false)}
            className="block text-[12px] text-white/50 hover:text-white transition-colors mb-2"
          >
            &larr; All Vouchers
          </Link>
          <div className="text-[11px] uppercase tracking-[0.15em] text-white/30 mt-4 mb-2 font-semibold">
            New Voucher
          </div>
        </nav>
      </aside>

      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-30 bg-white border-b border-[var(--border-light)] px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="cursor-pointer p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="text-[13px] font-bold tracking-tight">SK MILLS</span>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
          <div className="animate-in">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
              <div>
                <h1 className="page-title">New Voucher</h1>
                <p className="text-[13px] text-[var(--muted)] mt-2">Double-entry journal entry</p>
              </div>
              <button onClick={() => router.back()} className="btn btn-outline btn-sm w-fit">
                &larr; Back
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8 gform">
                <div>
                  <label className="label block mb-2">Voucher Type</label>
                  <select
                    value={vtype}
                    onChange={(e) => setVtype(e.target.value)}
                    className="input-box mono"
                  >
                    <option value="JV">JV - Journal Voucher</option>
                    <option value="CR">CR - Cash Receipt</option>
                    <option value="CP">CP - Cash Payment</option>
                    <option value="BR">BR - Bank Receipt</option>
                    <option value="BP">BP - Bank Payment</option>
                    <option value="PR">PR - Petty Cash Receipt</option>
                    <option value="PC">PC - Petty Cash Payment</option>
                  </select>
                </div>
                <div>
                  <label className="label block mb-2">Date</label>
                  <input
                    type="date"
                    value={vdate}
                    onChange={(e) => setVdate(e.target.value)}
                    className="input-box mono"
                  />
                </div>
                <div>
                  <label className="label block mb-2">Narration</label>
                  <input
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    className="input-box"
                    placeholder="Voucher description"
                  />
                </div>
              </div>

              <div className="section-title">Journal Lines</div>

              <div className="overflow-x-auto">
              <table className="mb-4">
                  <thead>
                    <tr>
                      <th className="w-8">#</th>
                      <th>Account Code</th>
                      <th>Narration</th>
                      <th className="text-right">Debit</th>
                      <th className="text-right">Credit</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="mono text-[var(--muted)] text-[12px]">{idx + 1}</td>
                        <td>
                          <input
                            value={line.accCode}
                            onChange={(e) => updateLine(idx, "accCode", e.target.value)}
                            className="input-box mono text-[13px] w-full"
                            placeholder="e.g. 7.01.01"
                            list="voucher-accts"
                          />
                        </td>
                        <td>
                          <input
                            value={line.narration}
                            onChange={(e) => updateLine(idx, "narration", e.target.value)}
                            className="input-box text-[13px] w-full"
                            placeholder="Line description"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={line.debit}
                            onChange={(e) => updateLine(idx, "debit", e.target.value)}
                            className="input-box mono text-[13px] text-right w-full"
                            placeholder="0"
                            min="0"
                            step="any"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={line.credit}
                            onChange={(e) => updateLine(idx, "credit", e.target.value)}
                            className="input-box mono text-[13px] text-right w-full"
                            placeholder="0"
                            min="0"
                            step="any"
                          />
                        </td>
                        <td className="text-center">
                          {lines.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-[var(--muted)] hover:text-[var(--danger)] text-lg leading-none cursor-pointer"
                            >
                              &times;
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-black">
                      <td colSpan={3} className="font-bold text-[13px] uppercase tracking-[0.05em]">
                        Total
                      </td>
                      <td className="mono text-right font-bold text-[15px]">{formatNum(totalDebit)}</td>
                      <td className="mono text-right font-bold text-[15px]">{formatNum(totalCredit)}</td>
                      <td></td>
                    </tr>
                    {!isBalanced && totalDebit + totalCredit > 0 && (
                      <tr>
                        <td colSpan={3} className="text-[var(--danger)] text-[12px] font-semibold uppercase">
                          Difference
                        </td>
                        <td colSpan={2} className="mono text-right text-[var(--danger)] font-bold">
                          {formatNum(Math.abs(totalDebit - totalCredit))}
                        </td>
                        <td></td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              <button type="button" onClick={addLine} className="btn btn-outline btn-sm mb-6">
                + Add Line
              </button>

              {error && (
                <div className="border border-[var(--danger)] p-3 mb-4 text-[13px] text-[var(--danger)]">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving || !isBalanced}
                  className="btn disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Voucher"}
                </button>
                <button type="button" onClick={() => router.back()} className="btn btn-outline">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
