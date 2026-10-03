import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/** 브라우저(클라이언트 컴포넌트)용. 실시간 구독 등에 사용한다. */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
}
