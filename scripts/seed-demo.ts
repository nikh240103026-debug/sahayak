/**
 * npm run seed:demo — upsert bundled services and create the shared demo account
 * (DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD) with a fictional, already confirmed profile.
 * Used together with NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true for buildathon judging.
 */
import { BUNDLED_SERVICES } from "@app/shared/services";
import { loadEnvFiles } from "./load-env";
import { adminClient, prepareSampleApplicant } from "./lib-seed";

async function main() {
  loadEnvFiles();
  const db = adminClient();
  for (const s of BUNDLED_SERVICES) {
    const { error } = await db.from("services").upsert({ slug: s.slug, definition: s, enabled: s.enabled }, { onConflict: "slug" });
    if (error) throw new Error(`service ${s.slug}: ${error.message}`);
    console.log(`service ${s.slug} v${s.version} upserted`);
  }
  const email = process.env.DEMO_LOGIN_EMAIL;
  const password = process.env.DEMO_LOGIN_PASSWORD;
  if (!email || !password) {
    console.log("DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD not set: skipping the demo account.");
    return;
  }
  const id = await prepareSampleApplicant(db, email, password);
  console.log(`demo account ready: ${email} (${id}). Set NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true to show the shortcut.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
