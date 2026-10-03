import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

/** 서버 전용(Route Handler, Server Action, 이후 NestJS)에서 사용하는 DB 클라이언트 */
export function createDb(url: string) {
  // Supabase 커넥션 풀러(transaction 모드)는 prepared statement를 지원하지 않는다.
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
