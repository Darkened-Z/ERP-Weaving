import { IS_DEMO } from "@/lib/brand";

/**
 * Machine-side readings for the Live Production Board — what a loom
 * monitoring system reports per loom for the running shift. A real mill plugs
 * its monitoring system in here (file import or connector). The public demo has
 * no looms, so it runs a SIMULATED feed: each loom's own RPM, random stops
 * through the shift, deterministic for a given loom and minute so the numbers
 * only ever grow while the shift runs. The board labels it as simulated.
 */

export type LoomReading = {
  status: "RUNNING" | "STOPPED";
  reason: string | null;
  speed: number;
  efficiency: number;
  picks: number;
  runMinutes: number;
  stops: number;
};

export type Shift = { name: "Day" | "Night"; start: Date; end: Date; elapsedMin: number; window: string };

export type FeedSource = { kind: "simulated" | "none"; label: string };

const PKT_OFFSET_MS = 5 * 3600 * 1000; // Pakistan keeps UTC+5 all year
const SHIFT_MIN = 12 * 60;

/** Day 08:00–20:00, night 20:00–08:00, mill local time. */
export function currentShift(now = new Date()): Shift {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  const h = local.getUTCHours();
  const startLocal = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h >= 8 && h < 20 ? 8 : 20));
  if (h < 8) startLocal.setUTCDate(startLocal.getUTCDate() - 1);
  const start = new Date(startLocal.getTime() - PKT_OFFSET_MS);
  const day = h >= 8 && h < 20;
  return {
    name: day ? "Day" : "Night",
    start,
    end: new Date(start.getTime() + SHIFT_MIN * 60000),
    elapsedMin: Math.min(SHIFT_MIN, Math.max(0, (now.getTime() - start.getTime()) / 60000)),
    window: day ? "08:00–20:00" : "20:00–08:00",
  };
}

export function feedSource(): FeedSource {
  return IS_DEMO
    ? { kind: "simulated", label: "Simulated monitoring feed (demo)" }
    : { kind: "none", label: "No loom monitoring system connected" };
}

/** Machine readings keyed "shed|loom", or null when no feed is connected. */
export function loomReadings(
  looms: { shed: string; loomNo: number; rpm: number | null; type: string | null }[],
  shift: Shift,
): Map<string, LoomReading> | null {
  if (!IS_DEMO) return null;
  const out = new Map<string, LoomReading>();
  for (const l of looms) out.set(`${l.shed}|${l.loomNo}`, simulate(`${l.shed}-${l.loomNo}`, l.rpm ?? defaultRpm(l.type), shift));
  return out;
}

/** Metres woven from weft picks at the contract's picks per inch. */
export function picksToMetres(picks: number, pickPerInch: number | null): number | null {
  return pickPerInch ? picks / (pickPerInch * 39.37) : null;
}

function defaultRpm(type: string | null): number {
  const t = (type ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (t.includes("AIRJET")) return 800;
  if (t.includes("RAPIER") || t.includes("PROJECTILE")) return 450;
  return 200;
}

const REASONS = ["Warp break", "Weft break", "Waiting for weaver", "Weft change"];

function simulate(key: string, rpm: number, shift: Shift): LoomReading {
  const shiftKey = String(shift.start.getTime());
  const speed = Math.round(rpm * (0.93 + 0.06 * rand(key, "speed")));
  const stopChance = 0.12 + 0.12 * rand(key, "reliability");
  const elapsed = shift.elapsedMin;
  const fullSlots = Math.floor(elapsed / 10);
  let run = 0;
  let stops = 0;
  let status: LoomReading["status"] = "RUNNING";
  let reason: string | null = null;
  for (let s = 0; s <= fullSlots; s++) {
    const span = s < fullSlots ? 10 : elapsed - fullSlots * 10;
    if (span <= 0) break;
    const stopped = rand(key, shiftKey, s) < stopChance;
    if (!stopped) {
      run += span;
      continue;
    }
    stops++;
    const stopMin = 4 + 6 * rand(key, shiftKey, s, "length");
    run += Math.max(0, span - stopMin);
    if (s === fullSlots && span < stopMin) {
      status = "STOPPED";
      reason = REASONS[Math.floor(rand(key, shiftKey, s, "reason") * REASONS.length)];
    }
  }
  const picks = Math.round(run * speed);
  return {
    status,
    reason,
    speed: status === "RUNNING" ? speed : 0,
    efficiency: elapsed > 0 ? (picks / (rpm * elapsed)) * 100 : 0,
    picks,
    runMinutes: run,
    stops,
  };
}

/** Deterministic 0..1 from its parts: FNV-1a, then a final mix so inputs that differ only in their last characters (consecutive slots) do not land close together. */
function rand(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}
