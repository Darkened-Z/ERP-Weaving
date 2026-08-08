import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";
import { AutoRefresh } from "@/components/auto-refresh";
import { FullscreenToggle } from "@/components/fullscreen-toggle";
import { Timestamp } from "@/components/timestamp";

export const dynamic = "force-dynamic";

type LoomAgg = {
  loomNo: number;
  shed: string;
  weaverName: string | null;
  contractNo: string | null;
  greyCode: string | null;
  rpm: number | null;
  actRpm: number | null;
  statusWrk: string | null;
  currentContract: string | null;
  meters: number;
  picks: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  rejection: number;
  efficiency: number | null;
  hasProd: boolean;
};

function nf(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function effTone(eff: number | null): { bar: string; track: string; text: string } {
  if (eff == null) return { bar: "bg-neutral-700", track: "bg-neutral-800", text: "text-neutral-500" };
  if (eff >= 90) return { bar: "bg-green-500", track: "bg-green-900/30", text: "text-green-400" };
  if (eff >= 75) return { bar: "bg-yellow-500", track: "bg-yellow-900/30", text: "text-yellow-400" };
  return { bar: "bg-red-500", track: "bg-red-900/30", text: "text-red-400" };
}

export default async function ProductionBoardPage() {
  await requireSession();

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

  const maxDateRow = await db
    .select({ d: sql<string>`MAX(${schema.dailyProduction.productionDate})` })
    .from(schema.dailyProduction);
  const latestDate = maxDateRow[0]?.d ?? today;

  const todayRows = await db
    .select()
    .from(schema.dailyProduction)
    .where(eq(schema.dailyProduction.productionDate, today));

  const useDate = todayRows.length > 0 ? today : latestDate;
  const isFallback = useDate !== today;

  const rows = todayRows.length > 0
    ? todayRows
    : await db
        .select()
        .from(schema.dailyProduction)
        .where(eq(schema.dailyProduction.productionDate, useDate));

  const loomList = await db.select().from(schema.looms).orderBy(schema.looms.shed, schema.looms.loomNo);

  const byLoom = new Map<number, LoomAgg>();
  for (const l of loomList) {
    byLoom.set(l.loomNo, {
      loomNo: l.loomNo,
      shed: l.shed,
      weaverName: l.weaverName,
      contractNo: l.currentContract,
      greyCode: l.currentProduct,
      rpm: l.rpm,
      actRpm: l.actRpm,
      statusWrk: l.statusWrk,
      currentContract: l.currentContract,
      meters: 0,
      picks: 0,
      gradeA: 0,
      gradeB: 0,
      gradeC: 0,
      rejection: 0,
      efficiency: null,
      hasProd: false,
    });
  }

  const effAccum = new Map<number, { sum: number; n: number }>();

  for (const r of rows) {
    let a = byLoom.get(r.loomNo);
    if (!a) {
      a = {
        loomNo: r.loomNo,
        shed: r.shed,
        weaverName: r.weaverName,
        contractNo: r.contractNo,
        greyCode: r.greyCode,
        rpm: r.rpm,
        actRpm: null,
        statusWrk: null,
        currentContract: r.contractNo,
        meters: 0,
        picks: 0,
        gradeA: 0,
        gradeB: 0,
        gradeC: 0,
        rejection: 0,
        efficiency: null,
        hasProd: false,
      };
      byLoom.set(r.loomNo, a);
    }
    a.meters += r.meters ?? 0;
    a.picks += r.picks ?? 0;
    a.gradeA += r.gradeA ?? 0;
    a.gradeB += r.gradeB ?? 0;
    a.gradeC += r.gradeC ?? 0;
    a.rejection += r.rejection ?? 0;
    a.weaverName = a.weaverName ?? r.weaverName;
    a.contractNo = a.contractNo ?? r.contractNo;
    a.greyCode = a.greyCode ?? r.greyCode;
    a.hasProd = true;

    if (r.efficiency != null) {
      const acc = effAccum.get(r.loomNo) ?? { sum: 0, n: 0 };
      acc.sum += r.efficiency;
      acc.n += 1;
      effAccum.set(r.loomNo, acc);
    }
  }
  for (const [ln, acc] of effAccum) {
    const a = byLoom.get(ln);
    if (a && acc.n > 0) a.efficiency = acc.sum / acc.n;
  }

  const all = [...byLoom.values()];
  const running = all.filter((l) => l.hasProd);

  const totalMeters = all.reduce((s, l) => s + l.meters, 0);
  const totalPicks = all.reduce((s, l) => s + l.picks, 0);
  const totalGradeA = all.reduce((s, l) => s + l.gradeA, 0);
  const totalGradeB = all.reduce((s, l) => s + l.gradeB, 0);
  const totalGradeC = all.reduce((s, l) => s + l.gradeC, 0);
  const totalRej = all.reduce((s, l) => s + l.rejection, 0);
  const totalGrades = totalGradeA + totalGradeB + totalGradeC + totalRej;
  const effVals = running.map((l) => l.efficiency).filter((e): e is number => e != null);
  const weightedEffSum = running.reduce((s, l) => s + (l.efficiency != null ? l.efficiency * l.meters : 0), 0);
  const effMeters = running.reduce((s, l) => s + (l.efficiency != null ? l.meters : 0), 0);
  const avgEff = effMeters > 0 ? weightedEffSum / effMeters : 0;

  const runningWithMeters = running.filter((l) => l.meters > 0);
  const topLoom = runningWithMeters.reduce<LoomAgg | null>(
    (best, l) => (!best || l.meters > best.meters ? l : best),
    null,
  );
  const bottomLoom = runningWithMeters.reduce<LoomAgg | null>(
    (worst, l) => (!worst || l.meters < worst.meters ? l : worst),
    null,
  );

  const bySheds = new Map<string, LoomAgg[]>();
  for (const l of all) {
    const arr = bySheds.get(l.shed) ?? [];
    arr.push(l);
    bySheds.set(l.shed, arr);
  }
  const shedKeys = [...bySheds.keys()].sort();
  for (const k of shedKeys) bySheds.get(k)!.sort((a, b) => a.loomNo - b.loomNo);

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      <AutoRefresh intervalMs={30000} />
      <FullscreenToggle />

      <div className="px-8 pt-6 pb-4 border-b border-neutral-900">
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <div className="flex items-baseline gap-4">
            <div className="text-2xl font-bold tracking-[0.25em] uppercase">SK Mills</div>
            <div className="text-2xl font-light tracking-[0.35em] uppercase text-neutral-400">Live Production</div>
          </div>
          <div className="flex items-center gap-6">
            <a href="/" className="text-white/50 hover:text-white text-[11px] uppercase tracking-[0.1em] no-print">BACK</a>
            {isFallback && (
              <div className="bg-yellow-500 text-black px-3 py-1 text-[11px] uppercase tracking-[0.15em] font-bold">
                Latest: {useDate}
              </div>
            )}
            <div className="text-sm uppercase tracking-[0.2em] text-neutral-400"><Timestamp /></div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-neutral-500">
              <span className="w-2 h-2 bg-green-500 animate-pulse"></span>
              Refreshes every 30s
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pt-6 pb-8 grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-900">
        <StatCard label="Total Meters" value={nf(totalMeters)} sub="today" />
        <StatCard label="Avg Efficiency" value={effVals.length === 0 ? "—" : `${avgEff.toFixed(1)}%`} sub={`${effVals.length} looms reporting`} tone={effVals.length === 0 ? undefined : avgEff >= 85 ? "green" : avgEff >= 75 ? "yellow" : "red"} />
        <StatCard label="Looms Running" value={`${running.length}/${all.length}`} sub={`${((running.length / Math.max(all.length, 1)) * 100).toFixed(0)}% utilization`} />
        <StatCard label="Rejects" value={nf(totalRej)} sub={`${totalGrades > 0 ? ((totalRej / totalGrades) * 100).toFixed(1) : "0.0"}% of total`} tone="red" />
      </div>

      <div className="px-8 pb-4 grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-900">
        <StatCard label="Grade A" value={nf(totalGradeA)} sub={`${totalMeters ? ((totalGradeA / totalMeters) * 100).toFixed(1) : "0.0"}%`} tone="green" size="sm" />
        <StatCard label="Grade B" value={nf(totalGradeB)} sub={`${totalMeters ? ((totalGradeB / totalMeters) * 100).toFixed(1) : "0.0"}%`} size="sm" />
        <StatCard label="Top Loom" value={topLoom ? `#${topLoom.loomNo}` : "—"} sub={topLoom ? `${nf(topLoom.meters)} m · ${topLoom.weaverName ?? ""}` : ""} tone="green" size="sm" />
        <StatCard label="Bottom Loom" value={bottomLoom ? `#${bottomLoom.loomNo}` : "—"} sub={bottomLoom ? `${nf(bottomLoom.meters)} m · ${bottomLoom.weaverName ?? ""}` : ""} tone="red" size="sm" />
      </div>

      <div className="px-8 pb-12 space-y-10">
        {shedKeys.map((shed) => {
          const looms = bySheds.get(shed)!;
          const shedMeters = looms.reduce((s, l) => s + l.meters, 0);
          const shedRunning = looms.filter((l) => l.hasProd).length;
          const shedEff = looms.map((l) => l.efficiency).filter((e): e is number => e != null);
          const shedAvgEff = shedEff.length ? shedEff.reduce((a, b) => a + b, 0) / shedEff.length : 0;

          return (
            <section key={shed}>
              <div className="flex items-baseline justify-between mb-4 pb-3 border-b-2 border-white">
                <div className="flex items-baseline gap-6">
                  <h2 className="text-3xl font-bold tracking-[0.3em] uppercase">Shed {shed}</h2>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
                    {shedRunning}/{looms.length} running
                  </div>
                </div>
                <div className="flex items-baseline gap-8">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">Meters</span>
                    <span className="text-2xl font-bold">{nf(shedMeters)}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">Avg Eff</span>
                    <span className={`text-2xl font-bold ${effTone(shedAvgEff).text}`}>{shedAvgEff.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[70px_1fr_140px_120px_100px_80px_1fr] gap-x-4 gap-y-0 text-[11px] uppercase tracking-[0.15em] text-neutral-500 pb-2 border-b border-neutral-800">
                <div>Loom</div>
                <div>Weaver</div>
                <div>Contract</div>
                <div>Grey</div>
                <div className="text-right">Meters</div>
                <div className="text-right">Eff%</div>
                <div>Efficiency</div>
              </div>

              <div>
                {looms.map((l) => {
                  const tone = effTone(l.efficiency);
                  const barPct = Math.min(100, Math.max(0, l.efficiency ?? 0));
                  const idle = !l.hasProd;
                  return (
                    <div
                      key={l.loomNo}
                      className={`grid grid-cols-[70px_1fr_140px_120px_100px_80px_1fr] gap-x-4 items-center py-3 border-b border-neutral-900 ${idle ? "opacity-40" : ""}`}
                    >
                      <div className="text-2xl font-bold tabular-nums">#{l.loomNo}</div>
                      <div className="text-lg text-neutral-200 truncate">{l.weaverName ?? "—"}</div>
                      <div className="text-sm text-neutral-400 truncate">{l.contractNo ?? "—"}</div>
                      <div className="text-sm text-neutral-400 truncate">{l.greyCode ?? "—"}</div>
                      <div className="text-right text-2xl font-bold tabular-nums">{idle ? "—" : nf(l.meters)}</div>
                      <div className={`text-right text-xl font-bold tabular-nums ${tone.text}`}>
                        {l.efficiency != null ? `${l.efficiency.toFixed(0)}%` : "—"}
                      </div>
                      <div className={`h-6 ${tone.track} relative`}>
                        <div className={`absolute inset-y-0 left-0 ${tone.bar}`} style={{ width: `${barPct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {shedKeys.length === 0 && (
          <div className="py-24 text-center text-neutral-600 uppercase tracking-[0.3em]">No production data</div>
        )}
      </div>

      <div className="px-8 py-4 border-t border-neutral-900 flex justify-between items-center text-[11px] uppercase tracking-[0.2em] text-neutral-600">
        <div>Picks {nf(totalPicks)} · Grade C {nf(totalGradeC)}</div>
        <div>Board · {useDate}</div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  size = "lg",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "yellow" | "red";
  size?: "lg" | "sm";
}) {
  const toneCls =
    tone === "green"
      ? "text-green-400"
      : tone === "yellow"
      ? "text-yellow-400"
      : tone === "red"
      ? "text-red-400"
      : "text-white";
  const valueSize = size === "lg" ? "text-6xl" : "text-4xl";
  return (
    <div className="bg-black p-6">
      <div className="text-[11px] uppercase tracking-[0.25em] text-neutral-500 mb-3">{label}</div>
      <div className={`${valueSize} font-bold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] uppercase tracking-[0.15em] text-neutral-500 mt-2">{sub}</div>}
    </div>
  );
}
