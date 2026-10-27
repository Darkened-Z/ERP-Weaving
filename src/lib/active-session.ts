import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { verifyToken, type Session } from "./session-token";

/** A signed cookie proves identity; current account state decides access. */
export async function activeSession(raw: string | null | undefined): Promise<Session | null> {
  const signed = verifyToken(raw);
  if (!signed) return null;
  const [user] = await db.select({
    id: schema.users.id,
    login: schema.users.login,
    fullName: schema.users.fullName,
    roleName: schema.users.roleName,
    status: schema.users.status,
    allowedModules: schema.users.allowedModules,
  }).from(schema.users).where(eq(schema.users.id, signed.userId)).limit(1);
  if (!user || user.status !== "A") return null;
  return {
    userId: user.id, login: user.login, fullName: user.fullName, roleName: user.roleName,
    allowedModules: user.allowedModules ? user.allowedModules.split(",").map(s => s.trim()).filter(Boolean) : null,
  };
}
