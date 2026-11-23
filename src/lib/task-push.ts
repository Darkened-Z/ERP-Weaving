import { db } from "@/db";
import { sql } from "drizzle-orm";
import { after } from "next/server";
import { ensureTaskTables } from "@/lib/tasks";

/** Phones register their Expo push token here when the task app signs in. */
export async function saveDevice(userId: number, pushToken: string) {
  await ensureTaskTables();
  await db.run(sql`INSERT INTO mobile_devices (push_token, user_id, updated_at) VALUES (${pushToken}, ${userId}, ${new Date().toISOString()})
    ON CONFLICT(push_token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at`);
}

export async function dropDevice(pushToken: string, userId?: number) {
  await ensureTaskTables();
  await db.run(userId == null
    ? sql`DELETE FROM mobile_devices WHERE push_token = ${pushToken}`
    : sql`DELETE FROM mobile_devices WHERE push_token = ${pushToken} AND user_id = ${userId}`);
}

const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

/**
 * Push to every phone of these users through Expo's push service (which
 * forwards to Firebase). Runs after the response is sent, so a slow or
 * failing push never holds up a save. Phones that uninstalled the app are
 * forgotten.
 */
export function pushToUsers(userIds: number[], msg: { title: string; body: string; taskId: number }) {
  const ids = Array.from(new Set(userIds));
  if (!ids.length || process.env.DEMO_DB === "1") return;
  after(async () => {
    await ensureTaskTables();
    const rows = await db.all<{ push_token: string }>(
      sql`SELECT push_token FROM mobile_devices WHERE user_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
    );
    const tokens = rows.map((r) => r.push_token).filter(isExpoToken);
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100);
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(chunk.map((to) => ({ to, title: msg.title, body: msg.body, data: { taskId: msg.taskId }, sound: "default", channelId: "tasks", priority: "high" }))),
        });
        const j = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
        const gone = (j?.data ?? []).map((d, k) => (d.details?.error === "DeviceNotRegistered" ? chunk[k] : null)).filter((t): t is string => !!t);
        for (const t of gone) await dropDevice(t);
      } catch (e) {
        console.error("push failed", e);
      }
    }
  });
}
