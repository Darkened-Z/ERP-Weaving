import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await db
    .select()
    .from(schema.users)
    .orderBy(schema.users.roleName);

  const total = users.length;
  const active = users.filter((u) => u.status === "A").length;
  const roles = new Set(users.map((u) => u.roleName)).size;

  return (
    <Shell active="users">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">Users & Roles</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{active}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{roles}</div>
            <div className="stat-label">Roles</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Login</th>
              <th>Full Name</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="mono text-[13px]">{u.login}</td>
                <td>{u.fullName}</td>
                <td>{u.roleName}</td>
                <td>
                  <span
                    className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase"
                    style={{
                      background: u.status === "A" ? "#000" : "#999",
                      color: "#fff",
                      borderColor: u.status === "A" ? "#000" : "#999",
                    }}
                  >
                    {u.status === "A" ? "ACTIVE" : "BLOCKED"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </Shell>
  );
}
