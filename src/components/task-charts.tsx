"use client";

import { Fragment, useEffect, useRef, useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** Smooth path through points; control points stay between the two ends so the curve never overshoots. */
function smooth(pts: [number, number][]) {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${clamp(p1[1] + (p2[1] - p0[1]) / 6)} ${p2[0] - (p3[0] - p1[0]) / 6},${clamp(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Running totals of completed / assigned over 30 days; hover to read a day. */
export function TaskAreaChart({ data: daily, height = 220 }: { data: { date: string; done: number; created: number }[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = daily.reduce<{ date: string; done: number; created: number }[]>((acc, d) => {
    const prev = acc[acc.length - 1];
    acc.push({ date: d.date, done: (prev?.done ?? 0) + d.done, created: (prev?.created ?? 0) + d.created });
    return acc;
  }, []);
  const pad = { l: 30, r: 10, t: 14, b: 24 };
  const top = Math.ceil(Math.max(4, ...data.map((d) => Math.max(d.done, d.created))) / 4) * 4;
  const iw = Math.max(1, w - pad.l - pad.r), ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const line = (k: "done" | "created") => smooth(data.map((d, i) => [x(i), y(d[k])]));
  const area = (k: "done" | "created") => `${line(k)} L${x(data.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`;
  const p = pick != null ? data[pick] : null;

  return (
    <div
      ref={box}
      className="relative select-none"
      style={{ height }}
      onPointerMove={(e) => {
        const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
        setPick(Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / iw) * (data.length - 1)))));
      }}
      onPointerLeave={() => setPick(null)}
    >
      {w > 0 && (
        <svg width={w} height={height} className="block">
          <defs>
            <linearGradient id="tcDone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="1" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="tcNew" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--muted)" stopOpacity={0.18} />
              <stop offset="1" stopColor="var(--muted)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((g) => {
            const v = (top / 4) * g;
            return (
              <Fragment key={g}>
                <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border-light)" />
                <text x={pad.l - 6} y={y(v) + 4} fontSize={10} fill="var(--muted)" textAnchor="end" className="mono">{v}</text>
              </Fragment>
            );
          })}
          {data.map((d, i) => ((i % 7 === 0 && data.length - 1 - i >= 4) || i === data.length - 1) && (
            <text key={d.date} x={x(i)} y={height - 6} fontSize={10} fill="var(--muted)" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>{dm(d.date)}</text>
          ))}
          <path d={area("created")} fill="url(#tcNew)" />
          <path d={line("created")} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
          <path d={area("done")} fill="url(#tcDone)" />
          <path d={line("done")} stroke="var(--accent)" strokeWidth={2.5} fill="none" />
          {p && (
            <>
              <line x1={x(pick!)} x2={x(pick!)} y1={pad.t} y2={pad.t + ih} stroke="var(--border)" strokeDasharray="3 3" />
              <circle cx={x(pick!)} cy={y(p.created)} r={4} fill="#fff" stroke="var(--muted)" strokeWidth={2} />
              <circle cx={x(pick!)} cy={y(p.done)} r={5} fill="#fff" stroke="var(--accent)" strokeWidth={3} />
            </>
          )}
        </svg>
      )}
      {p && (
        <div className="absolute top-0 pointer-events-none border border-black bg-white px-2 py-1 text-center w-[150px]" style={{ left: Math.min(Math.max(x(pick!) - 75, 0), w - 150) }}>
          <div className="text-[12px] font-bold">{p.done} done · {p.created} assigned</div>
          <div className="text-[11px] text-[var(--muted)]">by {dm(p.date)}</div>
        </div>
      )}
    </div>
  );
}

/** Donut with a legend; hovering a slice or a legend row puts it in the centre. */
export function TaskStatusRing({ parts, size = 170, stroke = 24 }: { parts: { key: string; label: string; value: number; color: string; href: string }[]; size?: number; stroke?: number }) {
  const [sel, setSel] = useState<string | null>(null);
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const cur = parts.find((p) => p.key === sel);
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border-light)" strokeWidth={stroke} fill="none" />
          {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
            const len = (p.value / total) * circ;
            const el = (
              <circle key={p.key} cx={size / 2} cy={size / 2} r={r} stroke={p.color} fill="none" className="cursor-pointer transition-all"
                strokeWidth={sel === p.key ? stroke + 6 : stroke} opacity={sel && sel !== p.key ? 0.3 : 1}
                strokeDasharray={`${Math.max(len - (total > 1 ? 2 : 0), 1)} ${circ}`} strokeDashoffset={-offset}
                onMouseEnter={() => setSel(p.key)} onMouseLeave={() => setSel(null)} />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="mono text-[30px] font-bold leading-none">{cur ? cur.value : total}</div>
          <div className="text-[11px] text-[var(--muted)] mt-1">{cur ? cur.label : "Total tasks"}</div>
        </div>
      </div>
      <div className="w-full">
        {parts.map((p) => (
          <a key={p.key} href={p.href} onMouseEnter={() => setSel(p.key)} onMouseLeave={() => setSel(null)}
            className={`flex items-center gap-2 px-2 py-1.5 text-[13px] ${sel === p.key ? "bg-[var(--bg)]" : ""}`}>
            <span className="w-2.5 h-2.5 shrink-0" style={{ background: p.color }} />
            <span className="flex-1">{p.label}</span>
            <span className="mono text-[12px] text-[var(--muted)] w-8 text-right">{p.value}</span>
            <span className="mono text-[13px] font-bold w-11 text-right">{total ? Math.round((p.value / total) * 100) : 0}%</span>
          </a>
        ))}
      </div>
    </div>
  );
}
