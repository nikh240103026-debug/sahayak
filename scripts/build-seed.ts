/** SQL that upserts every bundled service definition into public.services. */
import { BUNDLED_SERVICES } from "@app/shared/services";

function literal(json: unknown): string {
  // Dollar-quoting avoids escaping; the tag cannot appear in the JSON.
  return `$svc$${JSON.stringify(json)}$svc$::jsonb`;
}

export function seedSql(): string {
  return BUNDLED_SERVICES.map(
    (s) =>
      `insert into public.services (slug, definition, enabled)\nvalues ('${s.slug}', ${literal(s)}, ${s.enabled})\n` +
      `on conflict (slug) do update set definition = excluded.definition, enabled = excluded.enabled, updated_at = now();\n`,
  ).join("\n");
}

if (process.argv[1]?.endsWith("build-seed.ts")) {
  console.log(seedSql());
}
