"use server";

import { redirect } from "next/navigation";
import { authErrorMessage, type ActionState } from "@/lib/api/errors";
import { safeNextPath } from "@/lib/api/session";
import { createClient } from "@/lib/supabase/server";

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    next: safeNextPath(formData.get("next")),
  };
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { email, password, next } = readCredentials(formData);
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error) };

  redirect(next);
}

export async function signup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { email, password, next } = readCredentials(formData);
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return { error: "이름을 입력해 주세요." };
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요." };
  if (password.length < 6) return { error: "비밀번호는 6자 이상으로 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return { error: authErrorMessage(error) };

  // 이메일 인증을 켠 환경(운영)에서는 세션 없이 돌아온다.
  if (!data.session) {
    return { ok: true, message: "가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요." };
  }
  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
