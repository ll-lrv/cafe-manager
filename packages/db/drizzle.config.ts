import { defineConfig } from "drizzle-kit";

// 마이그레이션 SQL은 supabase/migrations 에 생성되어 Supabase CLI가 그대로 적용한다.
// NestJS로 옮길 때도 같은 스키마와 SQL을 재사용할 수 있다.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "../../supabase/migrations",
  migrations: { prefix: "supabase" },
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
