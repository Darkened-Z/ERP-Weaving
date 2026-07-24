import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import path from "path";
import * as schema from "./schema";

const isLocal = !process.env.TURSO_DATABASE_URL;

const client = createClient(
  isLocal
    ? { url: `file:${path.join(process.cwd(), "data.db")}` }
    : { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }
);

export const db = drizzle(client, { schema });
export { schema };
