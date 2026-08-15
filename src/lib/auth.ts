import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { createHmac } from "crypto";

const SECRET =
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build"
    ? (() => { throw new Error("SESSION_SECRET must be set in production"); })()
    : "dev-secret-change-in-production");

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export type Session = {
  userId: number;
  login: string;
  fullName: string;
  roleName: string;
};

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("session")?.value;
  if (!raw) return null;
  try {
    const [payload, sig] = raw.split(".");
    if (!payload || !sig) return null;
    if (sign(payload) !== sig) return null;
    return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function login(loginId: string, password: string): Promise<Session | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.login, loginId));

  const user = rows[0];
  if (!user || user.password !== password || user.status !== "A") return null;

  const session: Session = {
    userId: user.id,
    login: user.login,
    fullName: user.fullName,
    roleName: user.roleName,
  };

  const payload = Buffer.from(JSON.stringify(session)).toString("base64");
  const signed = `${payload}.${sign(payload)}`;

  const isProd = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();
  cookieStore.set("session", signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return session;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
