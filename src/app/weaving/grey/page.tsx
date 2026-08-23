import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function GreyPage() {
  const rows = await db.select().from(schema.greyConstruction).orderBy(schema.greyConstruction.code);

  return (
    <Shell active="grey">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Grey Construction</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} constructions
          </p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th className="text-right">Reed</th>
              <th className="text-right">Pick</th>
              <th>Warp Count</th>
              <th>Weft Count</th>
              <th>Weave</th>
              <th className="text-right">GSM</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono font-bold">{r.code}</td>
                <td>{r.description}</td>
                <td className="text-right mono">{r.reed ?? "-"}</td>
                <td className="text-right mono">{r.pick ?? "-"}</td>
                <td className="mono text-[13px]">{r.warpCount ?? "-"}</td>
                <td className="mono text-[13px]">{r.weftCount ?? "-"}</td>
                <td>{r.weaveType}</td>
                <td className="text-right mono">{r.gsm ?? "-"}</td>
                <td>
                  {r.status === "A" ? (
                    <span className="inline-block bg-black text-white px-2 py-0.5 text-[11px] font-bold uppercase">
                      Active
                    </span>
                  ) : (
                    <span className="inline-block bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--muted)]">
                      Inactive
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
