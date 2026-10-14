import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import path from "path";
import * as schema from "./schema";

const isLocal = !process.env.TURSO_DATABASE_URL;
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!isLocal && !process.env.TURSO_AUTH_TOKEN) {
  throw new Error("TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is set");
}

if (isLocal && process.env.NODE_ENV === "production" && !isBuildPhase) {
  throw new Error("TURSO_DATABASE_URL must be set in production — SQLite file storage is not available on serverless");
}

const localDbPath = process.env.LOCAL_DB_PATH || path.join(process.cwd(), "data.db");

// Vercel freezes the function between requests; Turso drops the idle keep-alive
// connection meanwhile, and the next query writes into the dead socket — "fetch
// failed: other side closed" / EPIPE / write ETIMEDOUT, which failed random page
// loads and saves. Those errors mean the request never reached the database, so
// it is sent once more on a fresh connection. Anything else (a real SQL or HTTP
// error) is not retried.
const DEAD_SOCKET = new Set(["UND_ERR_SOCKET", "EPIPE", "ETIMEDOUT"]);
async function fetchWithReconnect(request: Request): Promise<Response> {
  const again = request.clone();
  try {
    return await fetch(request);
  } catch (e) {
    const code = (e as { cause?: { code?: string } })?.cause?.code;
    if (!code || !DEAD_SOCKET.has(code)) throw e;
    return fetch(again);
  }
}

const client = createClient(
  isLocal
    ? { url: `file:${localDbPath}` }
    : { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN, fetch: fetchWithReconnect }
);

void client.execute("PRAGMA foreign_keys = ON");

export const db = drizzle(client, { schema });
export { schema };
