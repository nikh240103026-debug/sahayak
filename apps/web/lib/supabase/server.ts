import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, publicEnv } from "@/lib/env";

/** Supabase client acting as the signed-in user (RLS applies). */
export async function supabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS, so every caller must check ownership
 * explicitly. Server-only: the key never reaches the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  admin ??= createClient(publicEnv.supabaseUrl, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
