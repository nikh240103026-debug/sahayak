/**
 * npm run db:schema — combine supabase/migrations/*.sql and the generated service
 * seed into supabase/schema.sql, for one-paste setup in the Supabase SQL editor.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedSql } from "./build-seed";

const dir = "supabase/migrations";
const parts = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => `-- ==================== ${f} ====================\n${readFileSync(join(dir, f), "utf8").trim()}\n`);

const out = [
  "-- GENERATED FILE: edit supabase/migrations/*.sql or config/services/*.json, then run `npm run db:schema`.",
  "-- Paste this whole file into the Supabase SQL editor once. It is safe to run again.",
  "",
  ...parts,
  "-- ==================== services seed ====================",
  seedSql(),
].join("\n");

writeFileSync("supabase/schema.sql", out);
writeFileSync("supabase/seed.sql", `-- GENERATED FILE: run \`npm run db:schema\` to refresh.\n${seedSql()}`);
console.log(`Wrote supabase/schema.sql (${parts.length} migrations) and supabase/seed.sql`);
