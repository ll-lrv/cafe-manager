"use server";

import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/api/errors";
import { acceptInvitation } from "@/lib/api/members";
import { setCurrentStore } from "@/lib/api/stores";

export async function acceptInvitationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let storeId: string;
  try {
    storeId = await acceptInvitation(String(formData.get("token") ?? ""));
  } catch (e) {
    return toActionError(e);
  }
  await setCurrentStore(storeId);
  redirect("/dashboard");
}
