import { isResponse, json, mobileSession } from "@/lib/mobile-api";
import { isTaskAdmin } from "@/lib/tasks";
import { taskDashboard } from "@/lib/task-dashboard";

export const dynamic = "force-dynamic";

/** The phone's home dashboard. Admins see the whole mill (?mine=1 for their own); everyone else their own. */
export async function GET(req: Request) {
  const s = await mobileSession(req);
  if (isResponse(s)) return s;
  const whole = isTaskAdmin(s.roleName) && new URL(req.url).searchParams.get("mine") !== "1";
  return json(await taskDashboard(s.userId, whole));
}
