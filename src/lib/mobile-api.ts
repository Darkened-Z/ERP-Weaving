import { NextResponse } from "next/server";
import { activeSession } from "@/lib/active-session";
import { canAccess } from "@/lib/nav";
import type { Session } from "@/lib/session-token";
import { ensureTaskTables } from "@/lib/tasks";

/** Phone sign-ins last 180 days; deactivating the user in the ERP ends them at once. */
export const MOBILE_TTL = 180 * 24 * 60 * 60;

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * The phone app's user, from `Authorization: Bearer <token>`. Same signed
 * token as the web cookie, same live account check, and the user must have
 * Tasks or My Tasks in their modules.
 */
export async function mobileSession(req: Request): Promise<Session | NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const session = await activeSession(auth.startsWith("Bearer ") ? auth.slice(7).trim() : null);
  if (!session) return json({ error: "Signed out" }, 401);
  if (!canAccess(session, "/my-tasks") && !canAccess(session, "/tasks")) return json({ error: "No access to tasks" }, 403);
  await ensureTaskTables();
  return session;
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;
