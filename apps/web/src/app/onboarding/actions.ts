"use server";

import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/api/errors";
import { createStore, setCurrentStore } from "@/lib/api/stores";

export async function createStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let storeId: string;
  try {
    storeId = await createStore(String(formData.get("name") ?? ""));
  } catch (e) {
    return toActionError(e);
  }
  await setCurrentStore(storeId);
  redirect("/dashboard");
}
