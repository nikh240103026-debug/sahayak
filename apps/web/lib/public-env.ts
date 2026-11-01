/** Values that are safe in the browser (inlined at build time by Next.js). */
export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  demoLogin: process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true",
  googleAuth: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true",
};
