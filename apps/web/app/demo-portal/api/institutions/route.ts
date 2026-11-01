import { NextResponse } from "next/server";
import { demoDistrict, demoState } from "@app/shared/demo-portal";
import { getSession } from "@/lib/demo-portal/session";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const state = demoState(sp.get("state") ?? "");
  const district = state ? demoDistrict(state, sp.get("district") ?? "") : undefined;
  const s = await getSession();
  await new Promise((r) => setTimeout(r, s?.state.chaos.includes("dropdown") ? 1500 : 150));
  return NextResponse.json(
    { institutions: district?.institutions ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
