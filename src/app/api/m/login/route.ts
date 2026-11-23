import { checkCredentials } from "@/lib/auth";
import { canAccess } from "@/lib/nav";
import { createToken } from "@/lib/session-token";
import { MOBILE_TTL, json } from "@/lib/mobile-api";
import { isTaskAdmin } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { login?: string; password?: string } | null;
  const session = await checkCredentials(String(body?.login ?? ""), String(body?.password ?? ""));
  if (session === "throttled") return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  if (!session) return json({ error: "Wrong user name or password" }, 401);
  if (!canAccess(session, "/my-tasks") && !canAccess(session, "/tasks")) return json({ error: "This user has no access to tasks" }, 403);
  return json({
    token: createToken(session, MOBILE_TTL),
    user: { id: session.userId, name: session.fullName, admin: isTaskAdmin(session.roleName) },
  });
}
