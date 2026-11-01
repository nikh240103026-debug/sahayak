import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new NextResponse(null, { status: 403 });
  await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
