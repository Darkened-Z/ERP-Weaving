import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staff = await db.select().from(schema.productionStaff).orderBy(schema.productionStaff.code);

  const level1 = staff.filter((s) => s.level === 1);
  const level2 = staff.filter((s) => s.level === 2);
  const level3 = staff.filter((s) => s.level === 3);

  const levelLabels: Record<number, string> = {
    1: "Level 1 — Supervisors",
    2: "Level 2 — Assistants",
    3: "Level 3 — Operators",
  };

  const groups = [
    { level: 1, label: levelLabels[1], data: level1 },
    { level: 2, label: levelLabels[2], data: level2 },
    { level: 3, label: levelLabels[3], data: level3 },
  ];

  return (
    <Shell active="staff">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Production Staff</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {staff.length} staff members
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{staff.length}</div>
            <div className="stat-label">Total Staff</div>
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.level} className="mb-10">
            <div className="section-title">{g.label}</div>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Short</th>
                  <th>Cell</th>
                  <th>Shed</th>
                  <th>Shift</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {g.data.map((s) => (
                  <tr key={s.id}>
                    <td className="mono text-[13px]">{s.code}</td>
                    <td>{s.name}</td>
                    <td>{s.nameShort || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                    <td className="mono text-[13px]">{s.cell || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                    <td className="mono text-[13px]">{s.shed ?? <span className="text-[var(--muted)]">&mdash;</span>}</td>
                    <td>{s.shift || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                    <td>
                      <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Shell>
  );
}
