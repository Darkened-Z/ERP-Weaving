
"use server";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function checkSavePasswordAction(password: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  if (!password || !password.trim()) return false;
  const [user] = await db
    .select({ password: schema.users.password })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  return !!user && user.password === password.trim();
}

