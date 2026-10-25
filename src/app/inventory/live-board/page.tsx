import Link from "next/link";
import { Shell } from "@/components/shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { db, schema } from "@/db";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { loadConvContracts } from "@/lib/conv-contracts";
import { addDays, today } from "@/lib/time";
import { currentShift, feedSource, loomReadings, picksToMetres, type LoomReading } from "@/lib/loom-feed";

export const dynamic = "force-dynamic";

const REFRESH_MS = 30000;
const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt1 = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
const pkTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d);
const shortDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

type Tile = {
  shed: string;
  loomNo: number;
  type: string | null;
  rpm: number | null;
  beam: string;
  contNo: string | null;
  quality: string | null;
  reading: LoomReading | null;
  metres: number | null;
  last: { date: string; metres: number } | null;
  todayEntered: number | null;
};

/**
 * Live Production Board (demo, owner 2026-10-25): every loom carrying a beam,
 * shed by shed — what is on it (beam, contract, quality, last entered
 * production) next to what the loom monitoring system says for the running
 * shift (status, metres, efficiency, stops). Refreshes itself every 30 s.
 */
export default async function LiveBoardPage({ searchParams }: { searchParams: Promise<{ shed?: string }> }) {
  await requireSession();
  const p = await searchParams;
  const shedFilter = (p.shed ?? "").trim();
  const now = new Date();
  const shift = currentShift(now);
  const source = feedSource();
  const todayIso = today();

  const [looms, mounted, contracts, entries] = await Promise.all([
    db
      .select({ shed: schema.looms.shed, loomNo: schema.looms.loomNo, type: schema.looms.type, rpm: schema.looms.rpm, currentBeam: schema.looms.currentBeam, currentContract: schema.looms.currentContract })
      .from(schema.looms),
    db
      .select({ beamNo: schema.beams.beamNo, shed: schema.beams.shed, loomNo: schema.beams.loomNo, contractNo: schema.beams.contractNo })
      .from(schema.beams)
      .where(isNotNull(schema.beams.loomNo)),
    loadConvContracts(true),
    db
      .select({
        vDate: schema.intDailyProduction.vDate,
        shed: schema.intDailyProduction.shedNo,
        loomNo: schema.intDailyProductionSet.loomNo,
        metres: sql<number>`coalesce(sum(${schema.intDailyProductionSet.totalCount}), 0)`,
      })
      .from(schema.intDailyProductionSet)
      .innerJoin(schema.intDailyProduction, eq(schema.intDailyProduction.id, schema.intDailyProductionSet.productionId))
      .where(and(isNotNull(schema.intDailyProductionSet.loomNo), gte(schema.intDailyProduction.vDate, addDays(todayIso, -30))))
      .groupBy(schema.intDailyProduction.vDate, schema.intDailyProduction.shedNo, schema.intDailyProductionSet.loomNo),
  ]);

  const contractByNo = new Map(contracts.map((c) => [c.contNo, c]));
  const beamByLoom = new Map(mounted.map((b) => [`${b.shed}|${b.loomNo}`, b]));
  const lastByLoom = new Map<string, { date: string; metres: number }>();
  for (const e of entries) {
    const k = `${e.shed}|${e.loomNo}`;
    const cur = lastByLoom.get(k);
    if (!cur || e.vDate > cur.date) lastByLoom.set(k, { date: e.vDate, metres: Number(e.metres) });
  }

  const sheds = [...new Set(looms.map((l) => (l.shed ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const visibleLooms = looms.filter((l) => l.shed && (!shedFilter || l.shed === shedFilter));
  const working = visibleLooms.filter((l) => l.currentBeam || beamByLoom.has(`${l.shed}|${l.loomNo}`));
  const readings = loomReadings(working.map((l) => ({ shed: l.shed!, loomNo: l.loomNo, rpm: l.rpm, type: l.type })), shift);

  const tiles: Tile[] = working
    .map((l) => {
      const key = `${l.shed}|${l.loomNo}`;
      const b = beamByLoom.get(key);
      const contNo = l.currentContract ?? b?.contractNo ?? null;
      const c = contNo ? contractByNo.get(contNo) : undefined;
      const reading = readings?.get(key) ?? null;
      const last = lastByLoom.get(key) ?? null;
      return {
        shed: l.shed!,
        loomNo: l.loomNo,
        type: l.type,
        rpm: l.rpm,
        beam: l.currentBeam ?? b?.beamNo ?? "",
        contNo,
        quality: c?.productQuality ?? null,
        reading,
        metres: reading ? picksToMetres(reading.picks, c?.pick ?? null) : null,
        last,
        todayEntered: last && last.date === todayIso ? last.metres : null,
      };
    })
    .sort((a, b) => a.shed.localeCompare(b.shed, undefined, { numeric: true }) || a.loomNo - b.loomNo);

  const idleBySheds = new Map<string, number[]>();
  for (const l of visibleLooms) {
    if (working.includes(l)) continue;
    idleBySheds.set(l.shed!, [...(idleBySheds.get(l.shed!) ?? []), l.loomNo].sort((a, b) => a - b));
  }

  const summary = (ts: Tile[]) => {
    const withReading = ts.filter((t) => t.reading);
    const running = withReading.filter((t) => t.reading!.status === "RUNNING").length;
    const metres = ts.reduce((s, t) => s + (t.metres ?? 0), 0);
    const eff = withReading.length ? withReading.reduce((s, t) => s + t.reading!.efficiency, 0) / withReading.length : 0;
    return { running, stopped: withReading.length - running, metres, eff, projected: shift.elapsedMin > 0 ? (metres / shift.elapsedMin) * 720 : 0 };
  };
  const total = summary(tiles);
  const live = source.kind !== "none";

  return (
    <Shell active="live-board">
      <AutoRefresh intervalMs={REFRESH_MS} />
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-4">
          <div>
            <h1 className="page-title">Live Production Board</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              {shift.name} shift · {shift.window} · updated {pkTime(now)} · refreshes every {REFRESH_MS / 1000} s
            </p>
          </div>
          <span className={`text-[11px] mono uppercase tracking-[0.08em] px-2 py-1 border ${live ? "border-black" : "border-[var(--border)] text-[var(--muted)]"}`}>
            Machine data: {source.label}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-black border-2 border-black mb-4">
          <Stat value={`${tiles.length}`} label="Looms with a beam" />
          <Stat value={live ? `${total.running}` : "—"} label="Running now" />
          <Stat value={live ? `${total.stopped}` : "—"} label="Stopped now" />
          <Stat value={live ? fmt1(total.metres) : "—"} label={live ? `Metres this shift · ~${fmt(total.projected)} by ${shift.name === "Day" ? "20:00" : "08:00"}` : "Metres this shift"} />
          <Stat value={live ? `${total.eff.toFixed(1)}%` : "—"} label="Average efficiency" wide />
        </div>

        <div className="flex gap-2 flex-wrap mb-5">
          <Link href="/inventory/live-board" className={`btn btn-sm ${shedFilter ? "btn-outline" : ""}`}>All sheds</Link>
          {sheds.map((s) => (
            <Link key={s} href={`/inventory/live-board?shed=${encodeURIComponent(s)}`} className={`btn btn-sm ${shedFilter === s ? "" : "btn-outline"}`}>
              Shed {s}
            </Link>
          ))}
        </div>

        {!live && (
          <div className="border border-black p-3 mb-5 text-[12px]">
            No loom monitoring system is connected. The board shows what is on each loom and its last entered production; status, metres and efficiency appear once the mill&apos;s monitoring system is connected.
          </div>
        )}

        {(shedFilter ? [shedFilter] : sheds).map((shed) => {
          const ts = tiles.filter((t) => t.shed === shed);
          const idle = idleBySheds.get(shed) ?? [];
          if (!ts.length && !idle.length) return null;
          const s = summary(ts);
          return (
            <section key={shed} className="mb-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-black pb-1 mb-2">
                <h2 className="text-[15px] font-bold uppercase tracking-[0.08em]">Shed {shed}</h2>
                {live && ts.length > 0 && (
                  <span className="text-[12px] mono">
                    {s.running} running · {s.stopped} stopped · {fmt1(s.metres)} m · {s.eff.toFixed(1)}% eff
                  </span>
                )}
              </div>
              {ts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                  {ts.map((t) => (
                    <LoomTile key={`${t.shed}-${t.loomNo}`} t={t} />
                  ))}
                </div>
              )}
              {idle.length > 0 && (
                <p className="text-[11px] text-[var(--muted)] mt-2 mono">
                  No beam ({idle.length}): {idle.map((n) => `L${n}`).join(" · ")}
                </p>
              )}
            </section>
          );
        })}

        <p className="text-[11px] text-[var(--muted)] mt-4">
          Metres = machine picks ÷ (contract pick per inch × 39.37). Efficiency = picks woven ÷ (loom RPM × minutes into the shift).
          Beam, contract and last entry come from Daily Production; grading (A / B / C, rejection) stays a manual entry.
        </p>
      </div>
    </Shell>
  );
}

function Stat({ value, label, wide }: { value: string; label: string; wide?: boolean }) {
  return (
    <div className={`bg-white p-3 ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <div className="mono text-xl font-bold">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function LoomTile({ t }: { t: Tile }) {
  const r = t.reading;
  const stopped = r?.status === "STOPPED";
  const eff = r ? Math.min(100, Math.max(0, r.efficiency)) : 0;
  return (
    <div className={`bg-white p-2.5 text-[12px] ${stopped ? "border-2 border-dashed border-[var(--danger)]" : "border border-black"}`}>
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className="font-bold mono text-[14px] leading-none">L{t.loomNo}</div>
          <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted)] mt-1">
            {(t.type ?? "Loom").replace("_", " ")}
            {t.rpm ? ` · ${t.rpm} rpm` : ""}
          </div>
        </div>
        {r && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-[0.06em] ${stopped ? "border border-[var(--danger)] text-[var(--danger)]" : "bg-black text-white"}`}
          >
            {stopped ? "Stopped" : "Running"}
          </span>
        )}
      </div>

      {r ? (
        <>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="mono text-[22px] font-bold leading-none">{t.metres != null ? fmt1(t.metres) : "—"}</span>
            <span className="text-[10px] text-[var(--muted)]">m this shift</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-[var(--border-light,#e5e5e5)]">
              <div className="h-full bg-black" style={{ width: `${eff}%` }} />
            </div>
            <span className="mono text-[11px] font-bold">{r.efficiency.toFixed(0)}%</span>
          </div>
          <div className="mt-1 text-[10px] mono text-[var(--muted)]">
            {stopped ? <span className="text-[var(--danger)] font-semibold">{r.reason}</span> : `${r.speed} rpm`} · {r.stops} stop{r.stops === 1 ? "" : "s"} · {Math.round(r.runMinutes)} min run
          </div>
        </>
      ) : (
        <div className="mt-2 text-[10px] text-[var(--muted)]">No machine data</div>
      )}

      <div className="mt-2 pt-1.5 border-t border-[var(--border-light,#e5e5e5)] text-[10px] leading-snug">
        <div className="mono">
          <span className="font-semibold">{t.beam || "—"}</span>
          {t.contNo ? ` · ${t.contNo}` : ""}
        </div>
        {t.quality && <div className="truncate" title={t.quality}>{t.quality}</div>}
        <div className="text-[var(--muted)] mono">
          {t.todayEntered != null
            ? `Entered today: ${fmt(t.todayEntered)} m`
            : t.last
              ? `Last entry ${shortDate(t.last.date)}: ${fmt(t.last.metres)} m`
              : "No production entered"}
        </div>
      </div>
    </div>
  );
}
