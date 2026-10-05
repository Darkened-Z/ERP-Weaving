import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession, requireAdmin, verifySavePassword } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db-errors";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const BASE = "/settings/users";
const ROLES = ["ADMIN", "GM", "MANAGER", "OPERATOR", "VIEWER"];

async function save(formData: FormData) {
  "use server";
  await requireAdmin(BASE);

  const id = formData.get("id") as string;
  const login = (formData.get("login") as string).trim().toLowerCase();
  const fullName = (formData.get("fullName") as string).trim();
  const roleName = (formData.get("roleName") as string).trim().toUpperCase();
  const status = (formData.get("status") as string) || "A";
  const password = (formData.get("password") as string) || "";

  if (!login || !fullName || !roleName) redirect(`${BASE}?error=required`);

  try {
    if (id) {
      const set: Record<string, string> = { login, fullName, roleName, status };
      if (password) set.password = await bcrypt.hash(password, 10);
      await db.update(schema.users).set(set).where(eq(schema.users.id, Number(id)));
      redirect(`${BASE}?id=${id}`);
    } else {
      if (!password) redirect(`${BASE}?error=pw_required`);
      const hashed = await bcrypt.hash(password, 10);
      const [row] = await db
        .insert(schema.users)
        .values({ login, password: hashed, fullName, roleName, status })
        .returning();
      redirect(`${BASE}?id=${row.id}`);
    }
  } catch (e) {
    if (isUniqueViolation(e)) redirect(`${BASE}?${id ? `id=${id}&` : ""}error=exists`);
    throw e;
  }
}

async function remove(formData: FormData) {
  "use server";
  await requireAdmin(BASE);
  const id = Number(formData.get("id"));
  await db.delete(schema.users).where(eq(schema.users.id, id));
  redirect(BASE);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.roleName !== "ADMIN") redirect("/");
  const params = await searchParams;

  const users = (await db
    .select()
    .from(schema.users)
    .orderBy(schema.users.roleName, schema.users.login))
    .filter((u) => u.roleName !== "superadmin");

  const selected = params.id
    ? users.find((u) => u.id === Number(params.id)) ?? null
    : null;

  const total = users.length;
  const active = users.filter((u) => u.status === "A").length;
  const roleSet = new Set(users.map((u) => u.roleName));

  return (
    <Shell active="users">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Users & Roles{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
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
            <div className="stat-value">{roleSet.size}</div>
            <div className="stat-label">Roles</div>
          </div>
        </div>

        {params.error === "admin_only" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Only admins can manage users.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="border border-black p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {selected ? "Edit User" : "New User"}
                </div>
                <div className="flex gap-2">
                  <a href={BASE} className="btn btn-outline btn-sm">New</a>
                  {selected ? (
                    <form action={remove} className="inline">
                      <input type="hidden" name="id" value={selected.id} />
                      <ConfirmButton message="Delete this user? This cannot be undone.">
                        Delete
                      </ConfirmButton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {params.error === "exists" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  That login already exists.
                </div>
              )}
              {params.error === "required" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  Login, name, and role are required.
                </div>
              )}
              {params.error === "pw_required" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  Password is required for new users.
                </div>
              )}
              {params.error === "no_password" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  Password is required to save.
                </div>
              )}
              {params.error === "wrong_password" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  Incorrect password.
                </div>
              )}

              <form action={save}>
                {selected && <input type="hidden" name="id" value={selected.id} />}
                <datalist id="role-opts">
                  {ROLES.map((r) => (
                    <option key={r} value={r} />
                  ))}
                  {[...roleSet].filter((r) => !ROLES.includes(r)).map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 gform">
                  <div>
                    <label className="label block mb-1">Login</label>
                    <input
                      name="login"
                      className="input-box mono"
                      defaultValue={selected?.login ?? ""}
                      required
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Full Name</label>
                    <input
                      name="fullName"
                      className="input-box"
                      defaultValue={selected?.fullName ?? ""}
                      required
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Role</label>
                    <input
                      name="roleName"
                      className="input-box"
                      list="role-opts"
                      defaultValue={selected?.roleName ?? ""}
                      required
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select
                      name="status"
                      className="input-box"
                      defaultValue={selected?.status ?? "A"}
                    >
                      <option value="A">A - Active</option>
                      <option value="B">B - Blocked</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label block mb-1">
                      {selected ? "Password (leave blank to keep current)" : "Password"}
                    </label>
                    <input
                      name="password"
                      type="password"
                      className="input-box mono"
                      autoComplete="new-password"
                      {...(selected ? {} : { required: true })}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <input type="password" name="save_password" placeholder="Password" required className="input-box mono" style={{ width: 120, height: 28 }} autoComplete="off" />
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href={BASE} className="btn btn-outline btn-sm">Cancel</a>
                </div>
              </form>
            </div>
          </div>

          <div>
            <div className="overflow-x-auto" style={{ maxHeight: "70vh", overflowY: "auto" }}>
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
                  {users.map((u) => {
                    const isSel = selected?.id === u.id;
                    const href = `${BASE}?id=${u.id}`;
                    const style = { color: isSel ? "white" : "inherit" };
                    return (
                      <tr
                        key={u.id}
                        className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                      >
                        <td className="p-0 mono text-[13px]">
                          <a href={href} className="no-underline block px-2 py-1" style={style}>{u.login}</a>
                        </td>
                        <td className="p-0">
                          <a href={href} className="no-underline block px-2 py-1" style={style}>{u.fullName}</a>
                        </td>
                        <td className="p-0">
                          <a href={href} className="no-underline block px-2 py-1" style={style}>{u.roleName}</a>
                        </td>
                        <td className="p-0">
                          <a href={href} className="no-underline block px-2 py-1" style={style}>
                            <span
                              className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase"
                              style={{
                                background: isSel ? "white" : u.status === "A" ? "black" : "transparent",
                                color: isSel ? "black" : u.status === "A" ? "white" : "black",
                              }}
                            >
                              {u.status === "A" ? "ACTIVE" : "BLOCKED"}
                            </span>
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
