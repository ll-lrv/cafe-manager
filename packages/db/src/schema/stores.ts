import { pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";
import { memberRole } from "./enums";

export const stores = pgTable("stores", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Seoul"),
  createdAt: createdAt(),
});

/**
 * 로그인 사용자 프로필. id 는 Supabase auth.users.id 와 같다.
 * auth 스키마로의 FK와 가입 트리거는 Supabase 전용 마이그레이션에서 추가한다.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: createdAt(),
});

export const storeMembers = pgTable(
  "store_members",
  {
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.userId] })],
);
