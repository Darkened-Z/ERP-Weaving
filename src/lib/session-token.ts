import { createHmac, timingSafeEqual } from "crypto";

// Kept free of next/headers and the DB so proxy.ts can verify a session
// without pulling in the app's server modules.

const SECRET =
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build"
    ? (() => { throw new Error("SESSION_SECRET must be set in production"); })()
    : "dev-secret-change-in-production");

/** Session lifetime; the cookie's maxAge and the embedded expiry agree. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24;

export type Session = {
  userId: number;
  login: string;
  fullName: string;
  roleName: string;
  allowedModules?: string[] | null;
};

function sign(payload: string): Buffer {
  return createHmac("sha256", SECRET).update(payload).digest();
}

export function createToken(session: Session): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ ...session, exp })).toString("base64");
  return `${payload}.${sign(payload).toString("hex")}`;
}

/**
 * The session in a cookie value, or null if it is malformed, forged or
 * expired. The expiry travels inside the signed payload, so a copied cookie
 * stops working after the TTL whatever the browser does with maxAge.
 */
export function verifyToken(raw: string | undefined | null): Session | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const given = Buffer.from(sig, "hex");
  const expected = sign(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64").toString("utf-8")) as Session & { exp?: number };
    if (typeof data.exp !== "number" || data.exp * 1000 < Date.now()) return null;
    return { userId: data.userId, login: data.login, fullName: data.fullName, roleName: data.roleName, allowedModules: data.allowedModules };
  } catch {
    return null;
  }
}
