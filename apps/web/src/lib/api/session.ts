import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string;
}

/** 현재 로그인 사용자. 한 요청 안에서는 한 번만 조회한다. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", claims.sub)
    .maybeSingle();

  return {
    id: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    displayName: profile?.display_name ?? "사용자",
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 로그인 후 돌아갈 주소. 외부 사이트로 튕겨나가지 않도록 내부 경로만 허용한다. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
