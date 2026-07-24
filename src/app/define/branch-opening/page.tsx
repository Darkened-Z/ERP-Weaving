import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function BranchOpeningPage() {
  const branches = await db
    .select()
    .from(schema.branchOpening)
    .orderBy(schema.branchOpening.openingDate);

  return (
    <Shell active="branch-opening">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">New Branch Opening</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {branches.length} branches
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{branches.length}</div>
            <div className="stat-label">Registered Branches</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Branch Name</th>
              <th>Address</th>
              <th>City</th>
              <th>Phone</th>
              <th>Opening Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <td className="mono font-bold">{b.branchCode}</td>
                <td>{b.branchName}</td>
                <td className="text-[13px] text-[var(--muted)]">{b.address ?? "-"}</td>
                <td>{b.city ?? "-"}</td>
                <td className="mono text-[13px]">{b.phone ?? "-"}</td>
                <td className="mono text-[13px]">{b.openingDate}</td>
                <td>
                  <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                    {b.status === "A" ? "ACTIVE" : "CLOSED"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
