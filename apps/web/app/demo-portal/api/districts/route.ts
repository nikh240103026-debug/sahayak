import { NextResponse } from "next/server";
import { demoState } from "@app/shared/demo-portal";
import { getSession } from "@/lib/demo-portal/session";

export async function GET(req: Request) {
  const state = demoState(new URL(req.url).searchParams.get("state") ?? "");
  const s = await getSession();
  // Chaos: the old server is slow to fill dependent dropdowns.
  await new Promise((r) => setTimeout(r, s?.state.chaos.includes("dropdown") ? 1500 : 150));
  return NextResponse.json(
    { districts: state ? state.districts.map((d) => ({ code: d.code, name: d.name })) : [] },
    { headers: { "cache-control": "no-store" } },
  );
}
