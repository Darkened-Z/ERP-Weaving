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

const client = createClient(
  isLocal
    ? { url: `file:${localDbPath}` }
    : { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }
);

void client.execute("PRAGMA foreign_keys = ON");

export const db = drizzle(client, { schema });
export { schema };
