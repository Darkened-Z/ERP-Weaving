import { defineConfig } from "drizzle-kit";

const isRemote = !!process.env.TURSO_DATABASE_URL;

export default defineConfig(
  isRemote
    ? {
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dialect: "turso",
        dbCredentials: {
          url: process.env.TURSO_DATABASE_URL!,
          authToken: process.env.TURSO_AUTH_TOKEN,
        },
      }
    : {
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dialect: "sqlite",
        dbCredentials: { url: "file:./data.db" },
      }
);
