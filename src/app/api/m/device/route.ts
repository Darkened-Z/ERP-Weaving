import { isResponse, json, mobileSession } from "@/lib/mobile-api";
import { dropDevice, saveDevice } from "@/lib/task-push";

export const dynamic = "force-dynamic";

const tokenOf = async (req: Request) => {
  const b = (await req.json().catch(() => null)) as { pushToken?: string } | null;
  const t = String(b?.pushToken ?? "").trim();
  return t.length > 10 && t.length < 300 ? t : null;
};

export async function POST(req: Request) {
  const s = await mobileSession(req);
  if (isResponse(s)) return s;
  const t = await tokenOf(req);
  if (!t) return json({ error: "Bad token" }, 400);
  await saveDevice(s.userId, t);
  return json({ ok: true });
}

/** Sign-out: this phone stops getting pushes. */
export async function DELETE(req: Request) {
  const s = await mobileSession(req);
  if (isResponse(s)) return s;
  const t = await tokenOf(req);
  if (t) await dropDevice(t, s.userId);
  return json({ ok: true });
}
