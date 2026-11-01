import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions } from "@/lib/demo-portal/session";

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/demo-portal", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return res;
}
