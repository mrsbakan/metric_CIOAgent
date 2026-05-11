import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "../../database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env["POSTGRES_HOST"] ?? "localhost",
    port: Number(process.env["POSTGRES_PORT"] ?? 5432),
    database: process.env["POSTGRES_DB"] ?? "cio_agent",
    user: process.env["POSTGRES_USER"] ?? "cio_agent_app",
    password: process.env["POSTGRES_PASSWORD"] ?? "change_me",
    ssl: process.env["POSTGRES_SSL"] === "true",
  },
  verbose: true,
  strict: true,
});
