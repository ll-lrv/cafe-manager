import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

/**
 * 직원 초대. 사장이 링크를 만들어 보내면, 받은 사람이 로그인 후 수락해서 구성원이 된다.
 * 수락은 DB 함수 accept_invitation 으로만 처리한다.
 */
export const storeInvitations = pgTable(
  "store_invitations",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    /** 초대 링크에 들어가는 추측 불가능한 값 */
    token: text("token")
      .notNull()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
    /** 메모용. 이 이메일이 아니어도 링크를 가진 사람은 수락할 수 있다. */
    email: text("email"),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    acceptedBy: uuid("accepted_by").references(() => profiles.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("store_invitations_token_key").on(t.token),
    index("store_invitations_store_idx").on(t.storeId),
    // 사장 초대는 받지 않는다. 사장은 매장을 만든 사람이다.
    check("store_invitations_role_check", sql`${t.role} <> 'owner'`),
  ],
);
