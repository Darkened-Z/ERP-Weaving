import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function LoomsPage() {
  const looms = await db.select().from(schema.looms).orderBy(schema.looms.loomNo);

  const total = looms.length;
  const running = looms.filter((l) => l.status === "RUNNING").length;
  const idle = looms.filter((l) => l.status === "IDLE").length;
  const maintenance = looms.filter((l) => l.status === "MAINTENANCE").length;

  const shedA = looms.filter((l) => l.shed === "A");
  const shedB = looms.filter((l) => l.shed === "B");

  return (
    <Shell active="looms">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Looms</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {total} looms &middot; {running} running &middot; {idle} idle &middot; {maintenance} maintenance
          </p>
        </div>

        <div className="grid grid-cols-4 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Looms</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{running}</div>
            <div className="stat-label">Running</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{idle}</div>
            <div className="stat-label">Idle</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{maintenance}</div>
            <div className="stat-label">Maintenance</div>
          </div>
        </div>

        <div className="mb-10">
          <div className="section-title">Shed A</div>
          <div className="grid grid-cols-6 gap-px bg-black border border-black">
            {shedA.map((loom) => (
              <div key={loom.id} className="bg-white p-4">
                <div className="mono text-2xl font-bold">{loom.loomNo}</div>
                <div className="label mt-1">{loom.type}</div>
                <div className="mt-2">
                  {loom.status === "RUNNING" && (
                    <span className="inline-block bg-black text-white px-2 py-0.5 text-[11px] font-bold uppercase">
                      Running
                    </span>
                  )}
                  {loom.status === "IDLE" && (
                    <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                      Idle
                    </span>
                  )}
                  {loom.status === "MAINTENANCE" && (
                    <span className="inline-block bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--muted)]">
                      Maintenance
                    </span>
                  )}
                </div>
                {loom.currentProduct && (
                  <div className="mono text-[12px] text-[var(--muted)] mt-2">{loom.currentProduct}</div>
                )}
                {loom.rpm != null && (
                  <div className="mono text-[12px] text-[var(--muted)] mt-0.5">{loom.rpm} RPM</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-title">Shed B</div>
          <div className="grid grid-cols-6 gap-px bg-black border border-black">
            {shedB.map((loom) => (
              <div key={loom.id} className="bg-white p-4">
                <div className="mono text-2xl font-bold">{loom.loomNo}</div>
                <div className="label mt-1">{loom.type}</div>
                <div className="mt-2">
                  {loom.status === "RUNNING" && (
                    <span className="inline-block bg-black text-white px-2 py-0.5 text-[11px] font-bold uppercase">
                      Running
                    </span>
                  )}
                  {loom.status === "IDLE" && (
                    <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                      Idle
                    </span>
                  )}
                  {loom.status === "MAINTENANCE" && (
                    <span className="inline-block bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--muted)]">
                      Maintenance
                    </span>
                  )}
                </div>
                {loom.currentProduct && (
                  <div className="mono text-[12px] text-[var(--muted)] mt-2">{loom.currentProduct}</div>
                )}
                {loom.rpm != null && (
                  <div className="mono text-[12px] text-[var(--muted)] mt-0.5">{loom.rpm} RPM</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
