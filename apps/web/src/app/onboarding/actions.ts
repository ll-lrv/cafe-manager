"use server";

import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/api/errors";
import { createStore, setCurrentStore } from "@/lib/api/stores";
import { applyCafeTemplate } from "@/lib/api/templates";

export async function createStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let storeId: string;
  try {
    storeId = await createStore(String(formData.get("name") ?? ""));
  } catch (e) {
    return toActionError(e);
  }
  if (formData.get("template") === "on") {
    // 매장은 이미 만들어졌으니 실패해도 계속 진행한다. 대시보드에서 다시 불러올 수 있다.
    try {
      await applyCafeTemplate(storeId);
    } catch (e) {
      console.error(e);
    }
  }
  await setCurrentStore(storeId);
  redirect("/dashboard");
}
