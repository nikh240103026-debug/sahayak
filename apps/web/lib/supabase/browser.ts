"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/public-env";

let client: SupabaseClient | null = null;

/** Browser client with the anon key. Only used for Realtime subscriptions (RLS-protected). */
export function supabaseBrowser(): SupabaseClient {
  client ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return client;
}
