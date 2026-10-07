import "server-only";
import { isValidTimeZone, type MemberRole } from "@cafe/core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";
import { requireUser } from "./session";

const CURRENT_STORE_COOKIE = "cafe_store_id";

export interface StoreMembership {
  storeId: string;
  storeName: string;
  /** 매장 시간대 (IANA). "오늘"과 하루의 경계, 화면의 날짜·시각 표시에 쓴다. */
  timeZone: string;
  role: MemberRole;
}

export const getMyStores = cache(async (): Promise<StoreMembership[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_members")
    .select("role, store:stores(id, name, timezone)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw new ApiError(dbErrorMessage(error));

  return data.flatMap((m) =>
    m.store ? [{ storeId: m.store.id, storeName: m.store.name, timeZone: m.store.timezone, role: m.role }] : [],
  );
});

/** 지금 보고 있는 매장. 선택한 적이 없으면 첫 번째 매장 */
export const getCurrentStore = cache(async (): Promise<StoreMembership | null> => {
  const stores = await getMyStores();
  const selected = (await cookies()).get(CURRENT_STORE_COOKIE)?.value;
  return stores.find((s) => s.storeId === selected) ?? stores[0] ?? null;
});

/** 매장이 없으면 매장 만들기 화면으로 보낸다. */
export async function requireCurrentStore(): Promise<StoreMembership> {
  const store = await getCurrentStore();
  if (!store) redirect("/onboarding");
  return store;
}

export async function setCurrentStore(storeId: string) {
  (await cookies()).set(CURRENT_STORE_COOKIE, storeId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createStore(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError("매장 이름을 입력해 주세요.");
  if (trimmed.length > 50) throw new ApiError("매장 이름은 50자 이하로 입력해 주세요.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_store", { p_name: trimmed });
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}

/** 매장 이름·시간대 수정 (사장만. RLS와 컬럼 권한, DB 트리거가 최종 확인) */
export async function updateStore(storeId: string, input: { name: string; timeZone: string }) {
  const name = input.name.trim();
  if (!name) throw new ApiError("매장 이름을 입력해 주세요.");
  if (name.length > 50) throw new ApiError("매장 이름은 50자 이하로 입력해 주세요.");
  if (!isValidTimeZone(input.timeZone)) throw new ApiError("지원하지 않는 시간대입니다.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .update({ name, timezone: input.timeZone })
    .eq("id", storeId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("매장 정보는 사장만 바꿀 수 있습니다.");
}
