import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { loadRunState } from "@/lib/run-state";

export const runtime = "nodejs";

/** Polling fallback (and refresh target for Realtime events) for the live run view. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const state = await loadRunState(user.id, (await params).id);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}
