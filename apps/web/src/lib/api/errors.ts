/** 화면에 보여줄 수 있는 오류. 메시지는 사용자용 한국어 문장이다. */
export class ApiError extends Error {}

/** 서버 액션의 공통 반환 형태 */
export type ActionState = { error?: string; ok?: boolean; message?: string } | undefined;

// Supabase Auth 오류 코드 → 한국어 메시지
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  user_already_exists: "이미 가입된 이메일입니다.",
  email_exists: "이미 가입된 이메일입니다.",
  weak_password: "비밀번호가 너무 짧거나 단순합니다. 6자 이상으로 입력해 주세요.",
  email_address_invalid: "이메일 형식이 올바르지 않습니다.",
  over_request_rate_limit: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

export function authErrorMessage(error: { code?: string; message: string }): string {
  return (error.code && AUTH_MESSAGES[error.code]) || "로그인 처리 중 문제가 발생했습니다.";
}

/** DB 함수에서 RAISE EXCEPTION 한 한국어 메시지는 그대로, 그 외는 일반 메시지로 바꾼다. */
export function dbErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "권한이 없습니다.";
  if (error.code === "23505") return "이미 존재하는 항목입니다.";
  if (error.code === "23503") return "다른 기록에서 사용 중이라 삭제할 수 없습니다.";
  if (error.code === "23514") return "입력값이 올바르지 않습니다.";
  return "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export function toActionError(e: unknown): ActionState {
  if (e instanceof ApiError) return { error: e.message };
  console.error(e);
  return { error: "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요." };
}
