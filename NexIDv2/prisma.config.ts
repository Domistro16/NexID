import { defineConfig } from "prisma/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function envValue(name: string) {
  if (process.env[name]) return process.env[name];
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${name}=`));
  if (!line) return undefined;
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

const databaseUrl = envValue("DATABASE_URL");
const directUrl = envValue("DIRECT_URL");
const migrationUrl = directUrl || databaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {})
});
