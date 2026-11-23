import { db, schema } from "@/db";
import { isResponse, json, mobileSession } from "@/lib/mobile-api";
import { TASK_CATEGORIES, TASK_PRIORITIES, isTaskAdmin } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** Who is signed in, plus what the new-task form needs (admins only assign). */
export async function GET(req: Request) {
  const s = await mobileSession(req);
  if (isResponse(s)) return s;
  const admin = isTaskAdmin(s.roleName);
  const users = admin
    ? (await db.select({ id: schema.users.id, name: schema.users.fullName, role: schema.users.roleName, status: schema.users.status }).from(schema.users))
        .filter((u) => u.status === "A" && u.role !== "superadmin")
        .map((u) => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  return json({
    user: { id: s.userId, name: s.fullName, admin },
    users,
    categories: TASK_CATEGORIES,
    priorities: TASK_PRIORITIES.map(({ value, label }) => ({ value, label })),
  });
}
