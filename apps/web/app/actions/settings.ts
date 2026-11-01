"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ConsentPurpose } from "@app/shared";
import { requireUser } from "@/lib/auth";
import { recordConsent } from "@/lib/data";
import { purgeUserData } from "@/lib/maintenance";
import { supabaseServer } from "@/lib/supabase/server";

/** Withdrawing is as easy as granting: one button, recorded in the append-only ledger. */
export async function setConsentAction(formData: FormData): Promise<void> {
  const user = await requireUser("/app/settings");
  const purpose = ConsentPurpose.safeParse(formData.get("purpose"));
  if (!purpose.success) return;
  const granted = formData.get("granted") === "true";
  const sb = await supabaseServer();
  await recordConsent(sb, user.id, purpose.data, granted);
  if (purpose.data === "store_profile" && !granted) {
    await sb.from("profiles_private").delete().eq("user_id", user.id);
  }
  revalidatePath("/app/settings");
}

export interface DeleteState {
  error?: "confirm" | "generic";
}

export async function deleteAccountAction(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const user = await requireUser("/app/settings");
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") return { error: "confirm" };
  try {
    await purgeUserData(user.id);
  } catch {
    return { error: "generic" };
  }
  await (await supabaseServer()).auth.signOut().catch(() => undefined);
  redirect("/?deleted=1");
}
