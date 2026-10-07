import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createToken, verifyToken, SESSION_TTL_SECONDS, type Session } from "@/lib/session-token";

export type { Session };

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  return verifyToken(cookieStore.get("session")?.value);
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

// Failed-login throttle. In-memory, so each serverless instance counts on its
// own: it slows a password guesser down rather than stopping a determined one.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();

function isThrottled(key: string): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > LOCK_MS) {
    failures.delete(key);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

function noteFailure(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > LOCK_MS) failures.set(key, { count: 1, first: Date.now() });
  else f.count++;
}

export async function login(loginId: string, password: string): Promise<Session | null | "throttled"> {
  const key = (loginId ?? "").trim().toLowerCase();
  if (isThrottled(key)) return "throttled";

  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.login, key));

  const user = rows[0];
  if (!user || user.status !== "A" || !(await bcrypt.compare(password, user.password))) {
    noteFailure(key);
    return null;
  }
  failures.delete(key);

  const session: Session = {
    userId: user.id,
    login: user.login,
    fullName: user.fullName,
    roleName: user.roleName,
    allowedModules: user.allowedModules ? user.allowedModules.split(",") : null,
  };

  const signed = createToken(session);

  const isProd = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();
  cookieStore.set("session", signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return session;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

/**
 * Gate for destructive or approval actions (deletes, OK marks, bill removal).
 * Anyone else is sent back to `back` with error=admin_only.
 */
export async function requireAdmin(back: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.roleName !== "ADMIN" && session.roleName !== "superadmin") {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=admin_only`);
  }
  return session;
}

export async function verifySavePassword(password: string | null | undefined, back: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!password || !password.trim()) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=no_password`);
  }
  const [user] = await db
    .select({ password: schema.users.password })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=wrong_password`);
  }
  return session;
}
