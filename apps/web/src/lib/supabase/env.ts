function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`환경 변수 ${name} 가 없습니다. apps/web/.env.example 을 참고해 .env.local 을 만들어 주세요.`);
  return value;
}

// NEXT_PUBLIC_ 값은 빌드 시 문자열로 치환되므로 process.env.X 형태로 직접 참조해야 한다.
export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
