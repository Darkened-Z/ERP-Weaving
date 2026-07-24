import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

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
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
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

  const cookieStore = await cookies();
  cookieStore.set("session", Buffer.from(JSON.stringify(session)).toString("base64"), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return session;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
